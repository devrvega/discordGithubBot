import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Client, GatewayIntentBits, TextChannel, ClientOptions, ForumChannel } from 'discord.js';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManagerClient({});

interface RepoConfig {
  channelId: string;
  forumId?: string;
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

interface GitHubRelease {
  url: string;
  html_url: string;
  assets_url: string;
  upload_url: string;
  tarball_url: string;
  zipball_url: string;
  id: number;
  node_id: string;
  tag_name: string;
  target_commitish: string;
  author: GitHubUser;
  body: string;
}

interface GitHubWebhookPayload {
  action: string;
  issue?: GitHubIssue;
  release?: GitHubRelease;
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
    // Set up a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Discord client connection timeout')), 10000);
    });

    // Set up the ready promise
    const readyPromise = new Promise<void>((resolve, reject) => {
      client.once('ready', () => {
        console.log('Discord client is ready');
        resolve();
      });

      client.once('error', (error) => {
        console.error('Discord client error:', error);
        reject(error);
      });
    });

    // Attempt to login
    await client.login(config.discordToken);
    console.log('Discord client successfully logged in');
    
    // Race between timeout and ready event
    await Promise.race([readyPromise, timeoutPromise]);
    
    return client;
  } catch (error) {
    console.error('Failed to initialize Discord client:', error);
    // Ensure we destroy the client if initialization fails
    try {
      await client.destroy();
    } catch (destroyError) {
      console.error('Error destroying client after failed initialization:', destroyError);
    }
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

async function createForumPost(config: Config, forumId: string, title: string, content: string): Promise<void> {
  let client: Client | null = null;
  try {
    client = await getDiscordClient(config);
    const channel = await client.channels.fetch(forumId);
    
    if (!channel) {
      throw new Error(`Forum channel ${forumId} not found`);
    }

    if (!(channel instanceof ForumChannel)) {
      throw new Error(`Channel ${forumId} is not a forum channel`);
    }

    await channel.threads.create({
      name: title,
      message: {
        content: content
      }
    });
    console.log(`Successfully created forum post in channel ${forumId}`);
  } catch (error) {
    console.error('Error creating forum post:', error);
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
      case 'created':
        if (payload.issue) {
          message = `🎟️ ${payload.action === 'reopened' ? 'Issue reopened' : 'New Issue opened'} in ${repoName.split('/')[1]}\n` +
                   `Title: ${payload.issue.title}\n` +
                   `By: ${payload.issue.user.login}\n` +
                   `URL: ${payload.issue.html_url}`;
          console.log('Created issue message:', message);
        } else if (payload.pull_request) {
          message = `💾 ${payload.action === 'reopened' ? 'Pull Request reopened' : 'New Pull Request opened'} in ${repoName.split('/')[1]}\n` +
                   `Title: ${payload.pull_request.title}\n` +
                   `By: ${payload.pull_request.user.login}\n` +
                   `URL: ${payload.pull_request.html_url}`;
          console.log('Created PR message:', message);
        } else if (payload.action === 'created' && payload.release) {
          const title = `${payload.release.tag_name}`;
          const content = `${payload.release.body}\n\n` +
                         `**Created by:** ${payload.release.author.login}\n` +
                         `[View on GitHub](${payload.release.html_url})`;
          
          if (repoConfig.forumId) {
            console.log('Creating forum post for release');
            await createForumPost(config, repoConfig.forumId, title, content);
            console.log('Forum post created successfully');
          } else {
            message = `🎁 Release ${payload.release.tag_name} created in ${repoName.split('/')[1]}\n` +
                     `By: ${payload.release.author.login}\n` +
                     `URL: ${payload.release.html_url}`;
            console.log('Created release message:', message);
            await sendDiscordMessage(config, repoConfig.channelId, message);
          }
        }
        break;
      case 'closed':
        if (payload.issue) {
          message = `✅ Issue closed in ${repoName.split('/')[1]}\n` +
                   `Title: ${payload.issue.title}\n` +
                   `By: ${payload.issue.user.login}\n` +
                   `URL: ${payload.issue.html_url}`;
          console.log('Created closed issue message:', message);
        } else if (payload.pull_request) {
          message = `✅ Pull Request closed in ${repoName.split('/')[1]}\n` +
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