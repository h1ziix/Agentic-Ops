/** Shared server credential identifiers and signatures; never include actual secret values. */
export const secretNames = ["OPENAI_API_KEY", "GEMINI_API_KEY", "TAVILY_API_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_SECRET", "HUBSPOT_CLIENT_SECRET", "INTEGRATION_TOKEN_ENCRYPTION_KEY", "TRIGGER_SECRET_KEY", "AUTOMATION_JOB_SIGNING_SECRET"];
export const credentialSignatures = [
  ["OpenAI key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{25,}/],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{35}/],
  ["Google access token", /\bya29\.[A-Za-z0-9_-]{30,}/],
  ["GitHub token", /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];
export function configuredSecrets(environment = process.env) {
  return secretNames.map((name) => ({ name, value: environment[name]?.trim() }))
    .filter(({ value }) => value && value.length >= 12 && !value.includes("YOUR_"));
}
