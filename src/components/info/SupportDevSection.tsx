import Image from "next/image";

type Props = {
  className?: string;
};

const devs = [
  { name: "Dribb", handle: "@dribb", avatar: "/dribb-avatar.jpg" },
  { name: "Spies", handle: "@spiesss", avatar: "/spies-avatar.jpg" },
] as const;

export default function SupportDevSection({ className = "" }: Props) {
  return (
    <section
      id="support-devs"
      aria-labelledby="support-devs-heading"
      className={`card-brand ${className} p-6 sm:p-8`}
    >
      <div className="border-b border-line/70 pb-8">
        <span className="label-dash">THE PEOPLE BEHIND THE PLAYS</span>
        <h2 id="meet-the-devs-heading" className="font-display mt-3 text-3xl font-semibold text-white sm:text-4xl">
          Meet the Devs
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {devs.map((dev) => (
            <article key={dev.handle} className="flex items-center gap-4 rounded-xl border border-line bg-black/10 p-4">
              <Image
                src={dev.avatar}
                alt={`${dev.name} avatar`}
                width={80}
                height={80}
                className="h-20 w-20 shrink-0 rounded-full border border-line object-cover"
              />
              <div>
                <h3 className="font-display text-2xl font-semibold text-white">{dev.name}</h3>
                <p className="mt-1 text-sm font-medium tracking-wide text-steel">{dev.handle}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] lg:items-center">
        <div>
          <span className="label-dash">KEEPING THE LEAGUE RUNNING</span>
          <h2 id="support-devs-heading" className="font-display mt-3 text-3xl font-semibold text-white sm:text-4xl">
            Support the Devs
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-steel sm:text-base">
            If you enjoy the league and want to help keep the site, broadcasts, and tools going,
            you can support Zachari Bultman through PayPal.
          </p>
          <a
            href="https://www.paypal.com/paypalme/ZBultman"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-pill mt-6 inline-flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
          >
            Support via PayPal <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className="flex justify-center lg:justify-end">
          <Image
            src="/paypal-zbultman-qr.jpg"
            alt="PayPal QR code for Zachari Bultman"
            width={1170}
            height={2532}
            sizes="(max-width: 1024px) 80vw, 24rem"
            className="h-auto max-h-[34rem] w-auto max-w-full rounded-xl border border-line object-contain"
          />
        </div>
      </div>
    </section>
  );
}
