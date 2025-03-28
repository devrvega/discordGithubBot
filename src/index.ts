import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Client, GatewayIntentBits, TextChannel, ClientOptions } from 'discord.js';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManagerClient({});

interface RepoConfig {
  channelId: string;
}

interface Config {
  discordToken: string;
  repositories: {
    [key: string]: RepoConfig;
  };
}

interface GitHubUser {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  html_url: string;
  type: string;
}

interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: GitHubUser;
  html_url: string;
  description: string | null;
  fork: boolean;
  url: string;
}

interface GitHubIssue {
  url: string;
  repository_url: string;
  labels_url: string;
  comments_url: string;
  events_url: string;
  html_url: string;
  id: number;
  node_id: string;
  number: number;
  title: string;
  user: GitHubUser;
  labels: any[];
  state: string;
  locked: boolean;
  assignee: GitHubUser | null;
  assignees: GitHubUser[];
  milestone: any | null;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  author_association: string;
  body: string;
}

interface GitHubLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
  description: string;
}

interface GitHubWebhookPayload {
  action: string;
  issue?: GitHubIssue;
  pull_request?: any;
  repository: GitHubRepository;
  sender: GitHubUser;
  label?: GitHubLabel;
}

async function getConfig(): Promise<Config> {
  const command = new GetSecretValueCommand({
    SecretId: process.env.CONFIG_SECRET_NAME!
  });

  const response = await secretsManager.send(command);
  if (!response.SecretString) {
    throw new Error('Configuration not found in Secrets Manager');
  }

  return JSON.parse(response.SecretString);
}

async function getDiscordClient(config: Config): Promise<Client> {
  const clientOptions: ClientOptions = {
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  };

  const client = new Client(clientOptions);
  
  try {
    await client.login(config.discordToken);
    console.log('Discord client successfully logged in');
    
    // Wait for the client to be ready
    await new Promise<void>((resolve) => {
      client.once('ready', () => {
        console.log('Discord client is ready');
        resolve();
      });
    });
    
    return client;
  } catch (error) {
    console.error('Failed to login to Discord:', error);
    throw error;
  }
}

async function sendDiscordMessage(config: Config, channelId: string, content: string): Promise<void> {
  let client: Client | null = null;
  try {
    client = await getDiscordClient(config);
    const channel = await client.channels.fetch(channelId);
    
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    if (!(channel instanceof TextChannel)) {
      throw new Error(`Channel ${channelId} is not a text channel`);
    }

    await channel.send(content);
    console.log(`Successfully sent message to channel ${channelId}`);
  } catch (error) {
    console.error('Error sending Discord message:', error);
    throw error;
  } finally {
    // Clean up the client connection
    if (client) {
      try {
        await client.destroy();
        console.log('Discord client connection closed');
      } catch (error) {
        console.error('Error closing Discord client:', error);
      }
    }
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Lambda handler started');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    if (!event.body) {
      console.log('No body provided in the event');
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No body provided' }),
      };
    }

    console.log('Parsing event body');
    // Handle both string and object event bodies
    const payload: GitHubWebhookPayload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const repoName = payload.repository.full_name;
    console.log('Processing repository:', repoName);

    // Get configuration from Secrets Manager
    console.log('Fetching configuration from Secrets Manager');
    const config = await getConfig();
    console.log('Configuration retrieved successfully');
    
    const repoConfig = config.repositories[repoName];
    console.log('Repository config:', JSON.stringify(repoConfig, null, 2));
    
    if (!repoConfig) {
      console.log('No configuration found for repository:', repoName);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'No configuration found for repository' }),
      };
    }

    let message = '';
    const action = payload.action;
    console.log('Processing action:', action);

    switch (payload.action) {
      case 'opened':
      case 'reopened':
        if (payload.issue) {
          message = `🆕 ${payload.action === 'reopened' ? 'Issue reopened' : 'New Issue opened'} in ${repoName}\n` +
                   `Title: ${payload.issue.title}\n` +
                   `By: ${payload.issue.user.login}\n` +
                   `URL: ${payload.issue.html_url}`;
          console.log('Created issue message:', message);
        } else if (payload.pull_request) {
          message = `🔄 ${payload.action === 'reopened' ? 'Pull Request reopened' : 'New Pull Request opened'} in ${repoName}\n` +
                   `Title: ${payload.pull_request.title}\n` +
                   `By: ${payload.pull_request.user.login}\n` +
                   `URL: ${payload.pull_request.html_url}`;
          console.log('Created PR message:', message);
        }
        break;
      case 'closed':
        if (payload.issue) {
          message = `✅ Issue closed in ${repoName}\n` +
                   `Title: ${payload.issue.title}\n` +
                   `By: ${payload.issue.user.login}\n` +
                   `URL: ${payload.issue.html_url}`;
          console.log('Created closed issue message:', message);
        } else if (payload.pull_request) {
          message = `✅ Pull Request closed in ${repoName}\n` +
                   `Title: ${payload.pull_request.title}\n` +
                   `By: ${payload.pull_request.user.login}\n` +
                   `URL: ${payload.pull_request.html_url}`;
          console.log('Created closed PR message:', message);
        }
        break;
    }

    if (message) {
      console.log('Attempting to send Discord message');
      await sendDiscordMessage(config, repoConfig.channelId, message);
      console.log('Discord message sent successfully');
    } else {
      console.log('No message was created for this event');
    }

    console.log('Lambda handler completed successfully');
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Webhook processed successfully' }),
    };
  } catch (error) {
    console.error('Error in Lambda handler:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
}; 