
import { Button } from "@/components/ui/button";
import type { MouseEventHandler, ReactNode } from "react";

type GoogleButtonProps = {
  children: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
};

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="signup-google-icon">
      <path
        fill="currentColor"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"
      />
      <path
        fill="currentColor"
        opacity=".76"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="currentColor"
        opacity=".54"
        d="M6.4 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"
      />
      <path
        fill="currentColor"
        opacity=".9"
        d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-8.9 5.4l3.3 2.7C7.2 7.7 9.4 6 12 6Z"
      />
    </svg>
  );
}

export function GoogleButton({ children, onClick }: GoogleButtonProps) {
  return (
    <Button variant="secondary" size="lg" type="button" className="signup-google-button" onClick={onClick}>
      <GoogleIcon />
      <span>{children}</span>
    </Button>
  );
}
