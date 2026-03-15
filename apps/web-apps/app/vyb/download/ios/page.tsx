import { redirect } from "next/navigation";

// App Store URL — update with your real App Store ID once published
const APP_STORE_URL = "https://apps.apple.com/app/litvybzlive/id6749217842";

export default function IosDownloadPage() {
  redirect(APP_STORE_URL);
}
