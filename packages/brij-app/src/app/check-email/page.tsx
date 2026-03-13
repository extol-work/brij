export default function CheckEmail() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="mb-3">
          <h1 className="text-5xl font-bold text-bark-900">brij</h1>
          <p className="text-lg text-warm-gray-400 font-light">by Extol</p>
        </div>
        <h2 className="text-xl font-semibold text-bark-900 mb-3">
          Check your email
        </h2>
        <p className="text-warm-gray-500">
          We sent you a sign-in link. Click it to continue.
        </p>
        <p className="text-sm text-warm-gray-400 mt-4">
          Didn&apos;t get it? Check your spam folder or try again.
        </p>
      </div>
    </div>
  );
}
