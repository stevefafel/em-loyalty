/* eslint-disable @next/next/no-img-element */

const FOOTER_LINKS = [
  { label: "Resources", href: "https://corporate.exxonmobil.com/resources" },
  {
    label: "Terms and conditions",
    href: "https://corporate.exxonmobil.com/en/global-legal-pages/terms-and-conditions",
  },
  {
    label: "Privacy policy",
    href: "https://corporate.exxonmobil.com/en/global-legal-pages/privacy-policy",
  },
];

const BRAND_LOGOS = [
  {
    src: "/footer/exxon-logo.svg",
    alt: "Exxon",
    href: "https://www.exxon.com/en",
    className: "h-5 brightness-0 invert",
  },
  {
    src: "/footer/mobil-logo.svg",
    alt: "Mobil",
    href: "https://www.mobil.com/en",
    className: "h-5 brightness-0 invert",
  },
  {
    // Pre-colored monochrome (layered white-on-blue oval breaks under CSS invert)
    src: "/footer/esso-logo.svg",
    alt: "Esso",
    href: "https://www.esso.com/en",
    className: "h-7",
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 bg-exxon-charcoal">
      <div className="mx-auto flex flex-col gap-6 px-6 py-8 lg:flex-row lg:items-center lg:justify-between">
        {/* Brand marks */}
        <div className="flex items-center gap-8">
          <a
            href="https://corporate.exxonmobil.com"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <img
              src="/footer/exxonmobil-logo.svg"
              alt="ExxonMobil"
              className="h-8 w-auto brightness-0 invert opacity-90"
            />
            <span className="sr-only">(opens in new tab)</span>
          </a>
          <div className="flex items-center gap-6">
            {BRAND_LOGOS.map((logo) => (
              <a
                key={logo.alt}
                href={logo.href}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                <img
                  src={logo.src}
                  alt={logo.alt}
                  className={`${logo.className} w-auto opacity-75 transition-opacity hover:opacity-100`}
                />
                <span className="sr-only">(opens in new tab)</span>
              </a>
            ))}
          </div>
        </div>

        {/* Links + copyright */}
        <nav
          aria-label="Legal"
          className="flex flex-col gap-2 text-sm text-gray-300 sm:flex-row sm:items-center sm:gap-6"
        >
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              {link.label}
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          ))}
          <span className="text-gray-400">
            © Copyright 2003-{year} Exxon Mobil Corporation. All Rights
            Reserved.
          </span>
        </nav>
      </div>
    </footer>
  );
}
