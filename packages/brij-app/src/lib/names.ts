/** Extract first name from a display name, email, or guest name. */
export function firstName(name: string): string {
  if (name.includes("@")) return name.split("@")[0];
  return name.split(/\s+/)[0];
}

/** Single uppercase initial for avatar display. */
export function initial(name: string): string {
  return firstName(name).charAt(0).toUpperCase();
}
