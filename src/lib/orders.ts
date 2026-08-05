// Excludes 0/O/1/I to avoid ambiguity when a customer reads this back over Messenger.
const ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateOrderNumber(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ORDER_NUMBER_ALPHABET[
      Math.floor(Math.random() * ORDER_NUMBER_ALPHABET.length)
    ];
  }
  return `BW-${code}`;
}
