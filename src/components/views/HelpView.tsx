import { Panel, PageHeader } from '@/components/ui';

export function HelpView() {
  return (
    <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
      <PageHeader title="Help & support" description="How MIMO AGENT works, and how to get the most from it." />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="space-y-2 p-5">
          <h2 className="font-semibold">Getting started</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Pick an agent mode and model in the composer below the chat.</li>
            <li>Ask a question or describe a task. Complex requests show a plan in the activity panel.</li>
            <li>Attach a document or image with the paperclip to ground answers in your files.</li>
            <li>Open the Activity panel to see tools used, sources and memories.</li>
          </ol>
        </Panel>
        <Panel className="space-y-2 p-5">
          <h2 className="font-semibold">Trust and safety</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Web pages, documents and tool outputs are treated as data. They cannot change the agent's rules.</li>
            <li>Sensitive actions (such as saving notes or sending data) ask for your approval first.</li>
            <li>The agent cannot run system commands or execute code on the server.</li>
            <li>Answers can be wrong. Verify important facts, especially figures and citations.</li>
          </ul>
        </Panel>
        <Panel className="space-y-2 p-5">
          <h2 className="font-semibold">Uploads</h2>
          <p className="text-sm text-muted">PDF, TXT, CSV, DOCX, PNG, JPG and JPEG files are accepted. The file type is checked by its content, not only its name. Image understanding requires a vision model to be configured by your administrator.</p>
        </Panel>
        <Panel className="space-y-2 p-5">
          <h2 className="font-semibold">Need more help?</h2>
          <p className="text-sm text-muted">Contact your workspace administrator. Include the time of the issue; administrators can look up the matching audit entry.</p>
        </Panel>
      </div>
    </div>
  );
}
