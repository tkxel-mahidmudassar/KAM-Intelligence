import { redirect } from "next/navigation";

// Root → Home (primary dashboard)
export default function RootPage() {
  redirect("/home");
}
