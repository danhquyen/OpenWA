import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSessionsQuery } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { copyText } from '../utils/clipboard';
import './ApiDocs.css';

const BASE_URL_STORAGE_KEY = 'openwa_docs_base_url';
const SAMPLE_CHAT_ID = '84901234567@c.us';

type Snippets = Record<string, string>;

function readStoredBaseUrl(): string {
  try {
    return localStorage.getItem(BASE_URL_STORAGE_KEY) || window.location.origin;
  } catch {
    return window.location.origin;
  }
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void copyText(text).then(ok => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button className="docs-copy" onClick={copy} title={t('apiDocs.copy')} aria-label={t('apiDocs.copy')}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? t('apiDocs.copied') : t('apiDocs.copy')}</span>
    </button>
  );
}

function CodeBlock({ snippets }: { snippets: Snippets }) {
  const languages = Object.keys(snippets);
  const [active, setActive] = useState(languages[0]);
  const code = snippets[active] ?? snippets[languages[0]];

  return (
    <div className="docs-code">
      <div className="docs-code__bar">
        <div className="docs-code__tabs" role="tablist">
          {languages.map(lang => (
            <button
              key={lang}
              role="tab"
              aria-selected={lang === active}
              className={lang === active ? 'active' : ''}
              onClick={() => setActive(lang)}
            >
              {lang}
            </button>
          ))}
        </div>
        <CopyButton text={code} />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const sendTextSnippets = (base: string, sid: string): Snippets => ({
  cURL: `curl -X POST "${base}/api/sessions/${sid}/messages/send-text" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"chatId": "${SAMPLE_CHAT_ID}", "text": "Hello from OpenWA"}'`,
  'Node.js': `// Node.js 18+ (built-in fetch)
const res = await fetch('${base}/api/sessions/${sid}/messages/send-text', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.OPENWA_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ chatId: '${SAMPLE_CHAT_ID}', text: 'Hello from OpenWA' }),
});

const json = await res.json();
if (!res.ok) throw new Error(\`\${res.status}: \${json.message}\`);
console.log(json.messageId);`,
  Python: `import os
import requests

res = requests.post(
    "${base}/api/sessions/${sid}/messages/send-text",
    headers={"X-API-Key": os.environ["OPENWA_API_KEY"]},
    json={"chatId": "${SAMPLE_CHAT_ID}", "text": "Hello from OpenWA"},
    timeout=30,
)
body = res.json()
if not res.ok:
    raise RuntimeError(f"{res.status}: {body.get('message')}")
print(body["messageId"])`,
  PHP: `<?php
$ch = curl_init('${base}/api/sessions/${sid}/messages/send-text');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'X-API-Key: ' . getenv('OPENWA_API_KEY'),
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'chatId' => '${SAMPLE_CHAT_ID}',
        'text' => 'Hello from OpenWA',
    ]),
]);
$body = json_decode(curl_exec($ch), true);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($status >= 400) {
    throw new Exception($status . ': ' . json_encode($body['message'] ?? $body));
}
echo $body['messageId'];`,
});

const sendMediaSnippets = (base: string, sid: string): Snippets => ({
  'URL': `curl -X POST "${base}/api/sessions/${sid}/messages/send-image" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "chatId": "${SAMPLE_CHAT_ID}",
    "url": "https://example.com/invoice.jpg",
    "caption": "Your invoice"
  }'`,
  'Base64': `curl -X POST "${base}/api/sessions/${sid}/messages/send-document" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "chatId": "${SAMPLE_CHAT_ID}",
    "base64": "JVBERi0xLjQKJ...",
    "mimetype": "application/pdf",
    "filename": "invoice.pdf",
    "caption": "Your invoice"
  }'`,
});

const responseSnippets = (): Snippets => ({
  '201 Created': `{
  "messageId": "true_84901234567@c.us_3EB0C0A1B2C3D4E5F6",
  "timestamp": 1791212993
}`,
  '400 Session': `{
  "statusCode": 400,
  "message": "Session 'xxx' is not active. Start the session first.",
  "error": "Bad Request"
}`,
  '400 Body': `// Invalid JSON body (missing/unknown fields). With NODE_ENV=production
// the details are hidden and only this is returned:
{
  "statusCode": 400,
  "message": "Bad Request"
}`,
});

const webhookRegisterSnippets = (base: string, sid: string): Snippets => ({
  cURL: `curl -X POST "${base}/api/sessions/${sid}/webhooks" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-system.example.com/openwa/webhook",
    "events": ["message.received"],
    "secret": "a-long-random-secret",
    "retryCount": 3
  }'`,
});

const webhookPayloadSnippets = (sid: string): Snippets => ({
  'Headers': `POST /openwa/webhook HTTP/1.1
Content-Type: application/json
User-Agent: OpenWA-Webhook/1.0.0
X-OpenWA-Event: message.received
X-OpenWA-Delivery-Id: 5d0c...
X-OpenWA-Idempotency-Key: 9a1f...
X-OpenWA-Retry-Count: 0
X-OpenWA-Signature: sha256=3f5b...   (only when a secret is set)`,
  'Body': `{
  "event": "message.received",
  "timestamp": "2026-10-05T15:06:50.000Z",
  "sessionId": "${sid}",
  "idempotencyKey": "9a1f...",
  "deliveryId": "5d0c...",
  "data": {
    "id": "false_84901234567@c.us_3EB0...",
    "from": "84901234567@c.us",
    "to": "84902705757@c.us",
    "chatId": "84901234567@c.us",
    "body": "Hi, I need help with my order",
    "type": "chat",
    "timestamp": 1791212993,
    "fromMe": false,
    "isGroup": false
  }
}`,
});

const verifySignatureSnippets = (): Snippets => ({
  'Node.js': `import crypto from 'node:crypto';
import express from 'express';

const app = express();

// Keep the raw body: the signature is computed over the exact bytes received
app.post('/openwa/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.OPENWA_WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex');
  const received = req.get('X-OpenWA-Signature') || '';

  if (received.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return res.sendStatus(401);
  }

  const payload = JSON.parse(req.body.toString('utf8'));
  // Use payload.idempotencyKey to ignore duplicate deliveries
  res.sendStatus(200); // reply fast, process asynchronously
});`,
  Python: `import hashlib
import hmac
import os
from flask import Flask, abort, request

app = Flask(__name__)

@app.post("/openwa/webhook")
def openwa_webhook():
    expected = "sha256=" + hmac.new(
        os.environ["OPENWA_WEBHOOK_SECRET"].encode(),
        request.get_data(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-OpenWA-Signature", "")):
        abort(401)

    payload = request.get_json()
    # Use payload["idempotencyKey"] to ignore duplicate deliveries
    return "", 200`,
  PHP: `<?php
$raw = file_get_contents('php://input');
$expected = 'sha256=' . hash_hmac('sha256', $raw, getenv('OPENWA_WEBHOOK_SECRET'));
$received = $_SERVER['HTTP_X_OPENWA_SIGNATURE'] ?? '';

if (!hash_equals($expected, $received)) {
    http_response_code(401);
    exit;
}

$payload = json_decode($raw, true);
// Use $payload['idempotencyKey'] to ignore duplicate deliveries
http_response_code(200);`,
});

const endpoints: { method: string; path: string; body: string }[] = [
  { method: 'POST', path: '/messages/send-text', body: '{ chatId, text }' },
  { method: 'POST', path: '/messages/send-image', body: '{ chatId, url | base64 + mimetype, caption? }' },
  { method: 'POST', path: '/messages/send-video', body: '{ chatId, url | base64 + mimetype, caption? }' },
  { method: 'POST', path: '/messages/send-audio', body: '{ chatId, url | base64 + mimetype }' },
  { method: 'POST', path: '/messages/send-document', body: '{ chatId, url | base64 + mimetype, filename?, caption? }' },
  { method: 'POST', path: '/messages/send-location', body: '{ chatId, latitude, longitude, description?, address? }' },
  { method: 'POST', path: '/messages/send-contact', body: '{ chatId, contactName, contactNumber }' },
  { method: 'POST', path: '/messages/reply', body: '{ chatId, quotedMessageId, text }' },
  { method: 'POST', path: '/messages/send-bulk', body: '{ messages: [{ chatId, type, content }], options? }' },
  { method: 'GET', path: '/messages?chatId=&limit=&offset=', body: '—' },
];

const sections = ['quickstart', 'auth', 'ids', 'send', 'responses', 'webhooks', 'limits'] as const;

export function ApiDocs() {
  const { t } = useTranslation();
  useDocumentTitle(t('apiDocs.title'));
  const { data: sessions = [] } = useSessionsQuery();

  const [baseUrl, setBaseUrl] = useState(readStoredBaseUrl);
  const [selectedSession, setSelectedSession] = useState('');

  const base = baseUrl.replace(/\/+$/, '') || window.location.origin;
  const sessionId = selectedSession || sessions[0]?.id || 'YOUR_SESSION_ID';

  const updateBaseUrl = (value: string) => {
    setBaseUrl(value);
    try {
      localStorage.setItem(BASE_URL_STORAGE_KEY, value);
    } catch {
      // Storage unavailable, keep the value for this visit only
    }
  };

  return (
    <div className="api-docs">
      <PageHeader
        title={t('apiDocs.title')}
        subtitle={t('apiDocs.subtitle')}
        actions={
          <a className="docs-swagger" href="/api/docs" target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            {t('apiDocs.openSwagger')}
          </a>
        }
      />

      <div className="docs-settings">
        <div className="form-group">
          <label htmlFor="docs-base-url">{t('apiDocs.baseUrl')}</label>
          <input
            id="docs-base-url"
            value={baseUrl}
            onChange={e => updateBaseUrl(e.target.value)}
            placeholder="https://wa.example.com"
            spellCheck={false}
          />
          <small>{t('apiDocs.baseUrlHint')}</small>
        </div>
        <div className="form-group">
          <label htmlFor="docs-session">{t('apiDocs.session')}</label>
          <select id="docs-session" value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
            {sessions.length === 0 && <option value="">{t('apiDocs.noSessions')}</option>}
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
          <small>
            {t('apiDocs.sessionIdLabel')} <code className="mono">{sessionId}</code>
          </small>
        </div>
      </div>

      <div className="docs-layout">
        <nav className="docs-toc" aria-label={t('apiDocs.contents')}>
          <span className="docs-toc__title">{t('apiDocs.contents')}</span>
          {sections.map(id => (
            <a key={id} href={`#docs-${id}`}>
              {t(`apiDocs.sections.${id}.title`)}
            </a>
          ))}
        </nav>

        <div className="docs-content">
          <section id="docs-quickstart" className="docs-section">
            <h2>{t('apiDocs.sections.quickstart.title')}</h2>
            <ol>
              <li>{t('apiDocs.sections.quickstart.step1')}</li>
              <li>{t('apiDocs.sections.quickstart.step2')}</li>
              <li>{t('apiDocs.sections.quickstart.step3')}</li>
              <li>{t('apiDocs.sections.quickstart.step4')}</li>
            </ol>
            <CodeBlock snippets={sendTextSnippets(base, sessionId)} />
          </section>

          <section id="docs-auth" className="docs-section">
            <h2>{t('apiDocs.sections.auth.title')}</h2>
            <p>{t('apiDocs.sections.auth.intro')}</p>
            <CodeBlock
              snippets={{
                'X-API-Key': 'X-API-Key: YOUR_API_KEY',
                Bearer: 'Authorization: Bearer YOUR_API_KEY',
              }}
            />
            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t('apiDocs.sections.auth.role')}</th>
                  <th>{t('apiDocs.sections.auth.access')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>admin</code></td>
                  <td>{t('apiDocs.sections.auth.admin')}</td>
                </tr>
                <tr>
                  <td><code>operator</code></td>
                  <td>{t('apiDocs.sections.auth.operator')}</td>
                </tr>
                <tr>
                  <td><code>viewer</code></td>
                  <td>{t('apiDocs.sections.auth.viewer')}</td>
                </tr>
              </tbody>
            </table>
            <p className="docs-note">{t('apiDocs.sections.auth.tip')}</p>
          </section>

          <section id="docs-ids" className="docs-section">
            <h2>{t('apiDocs.sections.ids.title')}</h2>
            <table className="docs-table">
              <tbody>
                <tr>
                  <td><code>sessionId</code></td>
                  <td>{t('apiDocs.sections.ids.session')}</td>
                </tr>
                <tr>
                  <td><code>84901234567@c.us</code></td>
                  <td>{t('apiDocs.sections.ids.personal')}</td>
                </tr>
                <tr>
                  <td><code>120363xxxxxxxx@g.us</code></td>
                  <td>{t('apiDocs.sections.ids.group')}</td>
                </tr>
              </tbody>
            </table>
            <p className="docs-note">{t('apiDocs.sections.ids.phoneTip')}</p>
          </section>

          <section id="docs-send" className="docs-section">
            <h2>{t('apiDocs.sections.send.title')}</h2>
            <p>
              {t('apiDocs.sections.send.intro')} <code className="mono">/api/sessions/{'{sessionId}'}</code>
            </p>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>{t('apiDocs.sections.send.method')}</th>
                    <th>{t('apiDocs.sections.send.path')}</th>
                    <th>{t('apiDocs.sections.send.body')}</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map(e => (
                    <tr key={e.path}>
                      <td>
                        <span className={`docs-method docs-method--${e.method.toLowerCase()}`}>{e.method}</span>
                      </td>
                      <td><code className="mono">{e.path}</code></td>
                      <td><code className="mono">{e.body}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>{t('apiDocs.sections.send.media')}</h3>
            <p>{t('apiDocs.sections.send.mediaIntro')}</p>
            <CodeBlock snippets={sendMediaSnippets(base, sessionId)} />
          </section>

          <section id="docs-responses" className="docs-section">
            <h2>{t('apiDocs.sections.responses.title')}</h2>
            <p>{t('apiDocs.sections.responses.intro')}</p>
            <CodeBlock snippets={responseSnippets()} />
            <table className="docs-table">
              <tbody>
                <tr><td><code>400</code></td><td>{t('apiDocs.sections.responses.e400')}</td></tr>
                <tr><td><code>401</code></td><td>{t('apiDocs.sections.responses.e401')}</td></tr>
                <tr><td><code>403</code></td><td>{t('apiDocs.sections.responses.e403')}</td></tr>
                <tr><td><code>404</code></td><td>{t('apiDocs.sections.responses.e404')}</td></tr>
                <tr><td><code>429</code></td><td>{t('apiDocs.sections.responses.e429')}</td></tr>
                <tr><td><code>500</code></td><td>{t('apiDocs.sections.responses.e500')}</td></tr>
              </tbody>
            </table>
          </section>

          <section id="docs-webhooks" className="docs-section">
            <h2>{t('apiDocs.sections.webhooks.title')}</h2>
            <p>{t('apiDocs.sections.webhooks.intro')}</p>
            <CodeBlock snippets={webhookRegisterSnippets(base, sessionId)} />
            <p className="docs-note">{t('apiDocs.sections.webhooks.events')}</p>
            <h3>{t('apiDocs.sections.webhooks.payload')}</h3>
            <CodeBlock snippets={webhookPayloadSnippets(sessionId)} />
            <h3>{t('apiDocs.sections.webhooks.verify')}</h3>
            <p>{t('apiDocs.sections.webhooks.verifyIntro')}</p>
            <CodeBlock snippets={verifySignatureSnippets()} />
            <ul>
              <li>{t('apiDocs.sections.webhooks.ruleFast')}</li>
              <li>{t('apiDocs.sections.webhooks.ruleRetry')}</li>
              <li>{t('apiDocs.sections.webhooks.ruleIdempotent')}</li>
            </ul>
          </section>

          <section id="docs-limits" className="docs-section">
            <h2>{t('apiDocs.sections.limits.title')}</h2>
            <ul>
              <li>{t('apiDocs.sections.limits.rate')}</li>
              <li>{t('apiDocs.sections.limits.bulk')}</li>
              <li>{t('apiDocs.sections.limits.session')}</li>
              <li>{t('apiDocs.sections.limits.network')}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
