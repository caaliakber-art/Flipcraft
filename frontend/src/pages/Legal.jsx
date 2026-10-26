import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";

export const TERMS_VERSION = "26 October 2026";
const CONTACT = "[contact email to be added]";

const S = ({ h, children }) => (
  <section className="space-y-2">
    <h2 className="font-display text-lg font-semibold text-slate-100">{h}</h2>
    <div className="space-y-2 text-slate-300 leading-relaxed">{children}</div>
  </section>
);

function Page({ title, children }) {
  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-50">
      <header className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-blue-500 grid place-items-center"><BookOpen className="w-4 h-4 text-white" /></div>
            <span className="font-display font-bold text-lg tracking-tight">FlipCraft</span>
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          <p className="text-sm text-slate-500 mt-2">Version dated {TERMS_VERSION}. Draft for review.</p>
        </div>
        {children}
      </main>
    </div>
  );
}

export function Terms() {
  return (
    <Page title="Terms of Service">
      <S h="1. About these terms">
        <p>These terms govern your organisation's use of FlipCraft, a service that turns PDF documents into online flipbooks and libraries that can be shared by link or embedded on websites. By creating an account, you accept these terms on behalf of the organisation named at sign-up ("Customer").</p>
      </S>
      <S h="2. Accounts and workspaces">
        <p>Each Customer gets a workspace. The person who signs up is its owner and is responsible for keeping login details confidential and for all activity in the workspace. You must give accurate information and keep it up to date.</p>
      </S>
      <S h="3. Plans">
        <p>FlipCraft is offered on Free, Premium and Pro Plus plans, and on free demo arrangements agreed in writing. Each plan has its own limits on flipbooks, libraries, storage and features. We may change plan features with reasonable notice. Paid plans, when introduced, will be governed by an order form or pricing page.</p>
      </S>
      <S h="4. Your content">
        <p>You keep all rights in the documents, images, videos and branding you upload ("Customer Content"). You give FlipCraft a limited licence to store, process, convert and display Customer Content only to provide the service to you and your readers. You confirm you have the rights needed to publish it.</p>
      </S>
      <S h="5. Acceptable use">
        <p>You must not upload unlawful, infringing, misleading or harmful material, attempt to break or overload the service, access other customers' workspaces, or use the service to send spam or malware.</p>
      </S>
      <S h="6. Readers and analytics">
        <p>FlipCraft records reading activity on your flipbooks and libraries (such as opens, pages read and approximate location) and shows it to you. Where you identify individual readers, for example through personalised links, you are responsible for informing them and having a lawful basis under applicable law, including the Digital Personal Data Protection Act, 2023.</p>
      </S>
      <S h="7. Availability and support">
        <p>We aim to keep FlipCraft available and secure but do not guarantee uninterrupted service. Free and demo plans may have slower start-up times and no guaranteed support.</p>
      </S>
      <S h="8. Liability">
        <p>The service is provided "as is". To the extent permitted by law, FlipCraft is not liable for indirect or consequential losses, and its total liability is limited to the fees paid by you in the 12 months before the claim (or INR 10,000 for free and demo plans).</p>
      </S>
      <S h="9. Ending the service">
        <p>You may close your workspace at any time. We may suspend accounts that breach these terms. On closure, Customer Content is deleted within 30 days unless the law requires us to keep it.</p>
      </S>
      <S h="10. Law and contact">
        <p>These terms are governed by the laws of India, and courts at Bengaluru have jurisdiction. Questions: {CONTACT}.</p>
      </S>
    </Page>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <S h="What we collect">
        <p><b>Account holders:</b> name, work email, organisation name, a securely hashed password, and the date you accepted our terms.</p>
        <p><b>Readers of published flipbooks:</b> an anonymous browser identifier, pages viewed, time spent, whether the flipbook was opened by link or on a website, and approximate location derived from the network address. We do not ask readers for their names unless a customer chooses to.</p>
      </S>
      <S h="Why we use it">
        <p>To run your account, publish your flipbooks, show you reading statistics, keep the service secure, and contact you about the service.</p>
      </S>
      <S h="Where it is stored">
        <p>Application servers in Singapore (Render), database in Mumbai, India (MongoDB Atlas), and files in the United States (Backblaze B2). These providers process data only on our instructions.</p>
      </S>
      <S h="Who we share it with">
        <p>We do not sell personal data. Reading statistics for a workspace are shown only to that workspace. We share data with the hosting providers above and where the law requires.</p>
      </S>
      <S h="How long we keep it">
        <p>Account data for as long as the account is open, and up to 30 days after closure. Reader statistics for as long as the related flipbook exists.</p>
      </S>
      <S h="Your choices">
        <p>You can ask to see, correct or delete your personal data by writing to {CONTACT}. Customers are responsible for requests from readers they have identified through their own lists.</p>
      </S>
    </Page>
  );
}
