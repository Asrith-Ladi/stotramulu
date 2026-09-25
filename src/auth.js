const DEFAULT_FIREBASE_API_KEY = "AIzaSyCDwmjKvg-4XFra1NevTX4wW8BGsUzzQtU";

export async function verifyFirebaseToken(idToken, env) {
  const apiKey = env.FIREBASE_API_KEY || DEFAULT_FIREBASE_API_KEY;
  const response = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({idToken}),
    },
  );
  const body = await response.json();
  if (!response.ok || !body.users || !body.users.length) throw new Error("invalid token");
  return body.users[0].localId;
}
