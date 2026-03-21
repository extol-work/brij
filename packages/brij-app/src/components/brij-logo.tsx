/**
 * brij logo lockup — outlined Papyrus "brij" SVG + Outfit "by extol"
 *
 * Two variants:
 *   "nav"  — inline baseline-aligned, used in page headers
 *   "hero" — stacked/centered, used on landing + auth pages
 *
 * The "brij" mark uses an outlined SVG (Papyrus Bold converted to paths)
 * so it renders identically on all platforms.
 */

import Image from "next/image";

interface BrijLogoProps {
  variant?: "nav" | "hero";
}

export function BrijLogo({ variant = "nav" }: BrijLogoProps) {
  if (variant === "hero") {
    return (
      <div className="text-center">
        <Image
          src="/brij-light.svg"
          alt="brij"
          width={180}
          height={200}
          className="mx-auto"
          priority
        />
        <p className="brij-byline text-lg mt-1">by extol</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Image
        src="/brij-light.svg"
        alt="brij"
        width={56}
        height={63}
        priority
      />
      <span className="brij-byline text-[13px]">by extol</span>
    </div>
  );
}
