export function resetPasswordValidation(
  password: string,
  confirmPassword: string
) {
  if (password !== confirmPassword) {
    return "Passwords do not match";
  }
  if (Array.from(password).length < 8) {
    return "Password must be at least 8 characters";
  }
  if (new TextEncoder().encode(password).length > 72) {
    return "Password must be no more than 72 UTF-8 bytes";
  }
  return null;
}

export function resetTokenFromHash(hash: string) {
  if (!hash.startsWith("#")) {
    return "";
  }

  const token = new URLSearchParams(hash.slice(1)).get("token") || "";
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}
