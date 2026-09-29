export default function BangerUnavailable() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 text-white sm:px-6">
      <section className="card-brand p-6 sm:p-8">
        <span className="label-dash">Play · The Daily Stu</span>
        <h1 className="type-display mt-2 text-3xl sm:text-4xl">Today&apos;s feed is unavailable</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          The verified post feed or today&apos;s check could not be loaded. Try again in a moment; no empty feed or replacement post was substituted.
        </p>
      </section>
    </main>
  );
}
