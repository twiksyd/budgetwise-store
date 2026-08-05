export type Review = {
  id: string;
  name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  platform: "Facebook";
};

// Populated from real Facebook vouch/comment screenshots — paste as many
// entries as you have, in any order; the homepage carousel and "View more
// reviews" button both key off this file and need no other changes.
//
// Example entry:
// {
//   id: "1",
//   name: "Juan Dela Cruz",
//   rating: 5,
//   text: "Fast transaction, sobrang legit! Naka-receive agad ng Robux ko.",
//   platform: "Facebook",
// },
export const reviews: Review[] = [];
