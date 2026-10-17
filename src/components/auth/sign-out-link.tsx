"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutLink() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await createClient().auth.signOut();
    // A full load, not a client navigation: My Orders and chats are kept
    // in memory for speed, and none of it may outlive the session.
    window.location.replace("/");
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSignOut}
      disabled={isSigningOut}
    >
      <LogOut className="size-3.5" />
      Sign out
    </Button>
  );
}
