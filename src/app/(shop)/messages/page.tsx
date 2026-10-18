import type { Metadata } from "next";
import { MessagesEntry } from "@/components/customer-messages/messages-entry";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

// "Message Us Now" lands here when the right chat is not known yet (signed
// out, or no General Inquiry key in memory). A static shell: it paints the
// chat frame at once and replaces itself with the chat it picks.
export default function MessagesPage() {
  return <MessagesEntry />;
}
