export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ARIZE_API_KEY && process.env.ARIZE_SPACE_ID) {
    await import("./lib/tracing-setup");
  }
}
