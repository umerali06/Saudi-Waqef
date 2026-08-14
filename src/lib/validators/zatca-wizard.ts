import { z } from "zod";

export const zatcaOtpConfirmSchema = z.object({
  otp: z.string().trim().min(4).max(12),
});
