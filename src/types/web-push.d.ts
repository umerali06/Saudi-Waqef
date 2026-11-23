declare module "web-push" {
  type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
  type Options = {
    vapidDetails?: { subject: string; publicKey: string; privateKey: string };
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    timeout?: number;
  };
  const webpush: {
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
    sendNotification(
      subscription: Subscription,
      payload?: string,
      options?: Options
    ): Promise<{ statusCode: number }>;
  };
  export default webpush;
}
