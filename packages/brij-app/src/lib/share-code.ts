const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateShareCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}
