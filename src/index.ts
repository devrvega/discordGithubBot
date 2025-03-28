import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsManager = new SecretsManagerClient({});

interface WebhookConfig {
  channelId: string;
}

async function getDiscordToken(): Promise<string> {
  const command = new GetSecretValueCommand({
    SecretId: process.env.DISCORD_TOKEN_SECRET_NAME!
  });

  const response = await secretsManager.send(command);
  if (!response.SecretString) {
    throw new Error('Discord token not found in Secrets Manager');
  }

  const secret = JSON.parse(response.SecretString);
  return secret.discordToken;
}

async function getWebhookConfig(repoName: string): Promise<WebhookConfig | null> {
  const command = new GetCommand({
    TableName: process.env.CONFIG_TABLE_NAME!,
    Key: {
      repoName,
    },
  });

  const result = await docClient.send(command);
  if (!result.Item) {
    return null;
  }

  return {
    channelId: result.Item.channelId,
  };
}

async function sendDiscordMessage(config: WebhookConfig, content: string): Promise<void> {
  const discordToken = await getDiscordToken();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    await client.login(discordToken);
    const channel = await client.channels.fetch(config.channelId);
    
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

    // Get webhook configuration from DynamoDB
    const config = await getWebhookConfig(repoName);
    if (!config) {
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
      await sendDiscordMessage(config, message);
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