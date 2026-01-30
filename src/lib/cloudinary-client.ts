type SignatureResponse = {
  timestamp: number;
  signature: string;
  folder: string;
  cloudName: string;
  apiKey: string;
};

export async function uploadToCloudinary(file: File, folder: string) {
  const signatureResponse = await fetch("/api/uploads/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });

  if (!signatureResponse.ok) {
    throw new Error("Unable to get upload signature.");
  }

  const signatureData = (await signatureResponse.json()) as SignatureResponse;
  if (!signatureData.cloudName || !signatureData.apiKey) {
    throw new Error("Cloudinary is not configured.");
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signatureData.apiKey);
  formData.append("timestamp", signatureData.timestamp.toString());
  formData.append("signature", signatureData.signature);
  formData.append("folder", signatureData.folder);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/auto/upload`,
    {
      method: "POST",
      body: formData,
      signal: controller.signal,
    }
  ).finally(() => clearTimeout(timeout));

  const data = await uploadResponse.json();
  if (!uploadResponse.ok) {
    throw new Error(data?.error?.message ?? "Upload failed.");
  }

  return data.secure_url as string;
}
