import { redirect } from "next/navigation";

export const metadata = {
	title: "Aevryn",
};

export default function Home() {
	redirect("/signup");
}