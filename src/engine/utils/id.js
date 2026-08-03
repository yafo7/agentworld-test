export function generateInstanceId(prefix = 'ent') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${timestamp}_${random}`;
}
