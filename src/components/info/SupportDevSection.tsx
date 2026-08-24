import Image from "next/image";

type Props = {
  className?: string;
};

export default function SupportDevSection({ className = "" }: Props) {
  return (
    <section
      id="support-devs"
      aria-labelledby="support-devs-heading"
      className={`card-brand ${className} grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] lg:items-center`}
    >
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
    </section>
  );
}
