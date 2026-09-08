import { useState } from 'react';
import { ChevronDown, Copy, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OpenIn, OpenInTrigger, OpenInContent, OpenInLabel, OpenInItem, OpenInSeparator, OpenInChatGPT, OpenInClaude } from '@/components/ai-elements/open-in-chat';
import { ABOUT_PROMPT } from '@/lib/about-prompt';

export default function AskAboutMe() {
  const [status, setStatus] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(ABOUT_PROMPT);
      setStatus('Prompt copied. Paste it into your AI.');
    } catch {
      setShowPrompt(true);
      setStatus('Select the prompt below and copy it.');
    }
  }
  return <div className="mt-6">
    <OpenIn query={ABOUT_PROMPT}>
      <OpenInTrigger>
        <Button variant="outline" className="min-h-11 whitespace-normal text-left">
          <MessageCircle aria-hidden="true" />Ask your AI about me<ChevronDown aria-hidden="true" />
        </Button>
      </OpenInTrigger>
      <OpenInContent>
        <OpenInLabel>Take a useful prompt with you</OpenInLabel>
        <OpenInItem onSelect={() => { void copyPrompt(); }}><Copy aria-hidden="true" />Copy structured prompt</OpenInItem>
        <OpenInItem onSelect={() => setShowPrompt(value => !value)}>View prompt</OpenInItem>
        <OpenInSeparator />
        <OpenInChatGPT />
        <OpenInClaude />
      </OpenInContent>
    </OpenIn>
    <p role="status" aria-live="polite" className="mt-2 text-sm text-muted-foreground">{status}</p>
    {showPrompt && <label className="mt-3 block text-sm">Your prompt<textarea readOnly value={ABOUT_PROMPT} onFocus={event => event.currentTarget.select()} className="mt-2 block h-64 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs" /></label>}
  </div>;
}
