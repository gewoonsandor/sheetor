export const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export type Reply = { ok: boolean; status: number; body: unknown };

/// Every refusal from the API is `{"message": "..."}`, and those messages are
/// written to be read by a person, so they are shown verbatim.
export const readMessage = (body: unknown): string | null =>
  typeof body === 'object' &&
  body !== null &&
  'message' in body &&
  typeof body.message === 'string' &&
  body.message.length > 0
    ? body.message
    : null;

export const request = async (url: string, init?: RequestInit): Promise<Reply> => {
  const response = await fetch(url, init);
  // Anything in front of the API answers HTML on a bad day, so parsing must
  // not be the thing that throws.
  const body: unknown = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
};

export const sendJson = (
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
): Promise<Reply> =>
  request(
    url,
    payload === undefined
      ? { method }
      : {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
  );

export const failWith = (reply: Reply): never => {
  throw new Error(readMessage(reply.body) ?? FALLBACK_MESSAGE);
};
