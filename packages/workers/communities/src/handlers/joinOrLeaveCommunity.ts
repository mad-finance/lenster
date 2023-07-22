import validateLensAccount from '@lenster/lib/validateLensAccount';
import { error, type IRequest } from 'itty-router';
import { Client } from 'pg';
import { boolean, object, string } from 'zod';

import type { Env } from '../types';

type ExtensionRequest = {
  communityId: string;
  profileId: string;
  join: boolean;
  accessToken: string;
};

const validationSchema = object({
  communityId: string().uuid(),
  profileId: string(),
  join: boolean(),
  accessToken: string().regex(/^([\w=]+)\.([\w=]+)\.([\w+/=\-]*)/)
});

export default async (request: IRequest, env: Env) => {
  const body = await request.json();
  if (!body) {
    return error(400, 'Bad request!');
  }

  const validation = validationSchema.safeParse(body);

  if (!validation.success) {
    return new Response(
      JSON.stringify({ success: false, error: validation.error.issues })
    );
  }

  const { communityId, profileId, join, accessToken } =
    body as ExtensionRequest;

  try {
    const isAuthenticated = await validateLensAccount(accessToken, true);
    if (!isAuthenticated) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid access token!' })
      );
    }

    const client = new Client(env.DB_URL);
    await client.connect();

    let query;

    if (join) {
      query = {
        text: `
          INSERT INTO memberships (id, profile_id, community_id)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        values: [`${profileId}_${communityId}`, profileId, communityId]
      };
    } else {
      query = {
        text: `
          DELETE FROM memberships
          WHERE profile_id = $1 AND community_id = $2
          RETURNING *
        `,
        values: [profileId, communityId]
      };
    }

    const result = await client.query(query);

    return new Response(JSON.stringify(result.rows[0]));
  } catch (error) {
    throw error;
  }
};