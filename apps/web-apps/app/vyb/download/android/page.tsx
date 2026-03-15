import { redirect } from "next/navigation";

// Google Play URL — package ID: com.ghostchain.litvyblive
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.ghostchain.litvyblive";

export default function AndroidDownloadPage() {
  redirect(PLAY_STORE_URL);
}
