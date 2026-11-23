import { NextResponse } from "next/server";

/** A posting that cannot go ahead; the message is the API error code. */
export class PostingError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "PostingError";
  }
}

export function postingErrorResponse(error: unknown) {
  if (error instanceof PostingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
