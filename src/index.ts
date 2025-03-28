import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
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

async function sendDiscordMessage(config: Config, channelId: string, content: string): Promise<void> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    await client.login(config.discordToken);
    const channel = await client.channels.fetch(channelId);
    
    if (channel instanceof TextChannel) {
      await channel.send(content);
    }
  } finally {
    client.destroy();
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No body provided' }),
      };
    }

    const payload = JSON.parse(event.body);
    const repoName = payload.repository.full_name;

    // Get configuration from Secrets Manager
    const config = await getConfig();
    const repoConfig = config.repositories[repoName];
    
    if (!repoConfig) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'No configuration found for repository' }),
      };
    }

    let message = '';
    const action = payload.action;

    switch (payload.action) {
      case 'opened':
        if (payload.issue) {
          message = `🆕 New Issue opened in ${repoName}\n` +
                   `Title: ${payload.issue.title}\n` +
                   `By: ${payload.issue.user.login}\n` +
                   `URL: ${payload.issue.html_url}`;
        } else if (payload.pull_request) {
          message = `🔄 New Pull Request opened in ${repoName}\n` +
                   `Title: ${payload.pull_request.title}\n` +
                   `By: ${payload.pull_request.user.login}\n` +
                   `URL: ${payload.pull_request.html_url}`;
        }
        break;
      case 'closed':
        if (payload.issue) {
          message = `✅ Issue closed in ${repoName}\n` +
                   `Title: ${payload.issue.title}\n` +
                   `By: ${payload.issue.user.login}\n` +
                   `URL: ${payload.issue.html_url}`;
        } else if (payload.pull_request) {
          message = `✅ Pull Request closed in ${repoName}\n` +
                   `Title: ${payload.pull_request.title}\n` +
                   `By: ${payload.pull_request.user.login}\n` +
                   `URL: ${payload.pull_request.html_url}`;
        }
        break;
    }

    if (message) {
      await sendDiscordMessage(config, repoConfig.channelId, message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Webhook processed successfully' }),
    };
  } catch (error) {
    console.error('Error processing webhook:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}; 