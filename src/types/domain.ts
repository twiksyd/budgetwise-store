export interface CartItem {
  gamepassId: string;
  gameId: string;
  gameSlug: string;
  gameName: string;
  name: string;
  robuxAmount: number;
  /** Price snapshot at the time this was added — never trust it at checkout; re-validate server-side. */
  price: number;
  quantity: number;
}
