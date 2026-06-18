---
plan: "01-03-domain-registration-dns"
wave: 1
depends_on: []
files_modified: []
autonomous: false
requirements:
  - INFRA-01
---

# Plan 01-03: Domain Registration & Vercel DNS

## Objective

Register groupio.co.il via an ISOC-IL accredited registrar, configure DNS A record to Vercel's IP (76.76.21.21), add the domain to the Vercel project, and confirm SSL auto-provisions. Path-based routing (D-02); no Cloudflare proxy in Phase 1.

**Autonomous: false** — requires access to domain registrar portal and Vercel dashboard.

---

## Tasks

<task id="T1" name="Register groupio.co.il domain">
  <read_first>
    - .planning/phases/01-external-dependencies-unblocked/01-RESEARCH.md (Section 5.1: ISOC-IL registration steps, documents required, cost)
    - .planning/phases/01-external-dependencies-unblocked/01-CONTEXT.md (D-01, D-04: register .co.il only, via Isoc.org.il / Name.co.il)
  </read_first>
  <action>
    1. Check groupio.co.il availability at the registrar (Name.co.il recommended or any ISOC-IL accredited registrar from isoc.org.il/domains/accredited_registrars.html).
    2. Register for 1 or 2 years. Required: Israeli company registration number (ח.פ.) or mispar osek, contact details.
    3. Complete payment.
    4. Record registration date, registrar name, and expiry date in docs/runbooks/phase1-external-deps.md row "Domain groupio.co.il registration".
  </action>
  <acceptance_criteria>
    - Registrar account shows groupio.co.il as active/registered with expiry date
    - WHOIS for groupio.co.il returns Groupio entity as registrant (may take 24h to propagate)
    - Registration recorded in ops runbook
  </acceptance_criteria>
</task>

<task id="T2" name="Add groupio.co.il to Vercel project and get required DNS records">
  <read_first>
    - .planning/phases/01-external-dependencies-unblocked/01-RESEARCH.md (Section 5.2: Vercel DNS steps, A record 76.76.21.21, CNAME cname.vercel-dns.com)
    - .github/workflows/deploy.yml (read to confirm which Vercel project name to use)
  </read_first>
  <action>
    1. Log in to Vercel Dashboard → apps/web project → Settings → Domains.
    2. Click "Add domain" → enter groupio.co.il.
    3. Vercel will display required DNS records. Note them (should match: A @ → 76.76.21.21, CNAME www → cname.vercel-dns.com).
    4. Record Vercel configuration date in docs/runbooks/phase1-external-deps.md row "Vercel domain configuration".
    Note: Also flag the open question in the runbook — deploy.yml line 163 checks api.groupio.co.il which conflicts with D-02 path-based routing. Confirm whether backend VPS still needs api.groupio.co.il subdomain before Phase 3 DNS work.
  </action>
  <acceptance_criteria>
    - Vercel project Settings → Domains shows groupio.co.il in "pending" or "verified" state
    - DNS records required by Vercel are noted (A record IP and CNAME target)
  </acceptance_criteria>
</task>

<task id="T3" name="Configure DNS at registrar and verify SSL">
  <read_first>
    - .planning/phases/01-external-dependencies-unblocked/01-RESEARCH.md (Section 5.2: DNS record values; Section 5.3: deploy.yml subdomain conflict note)
  </read_first>
  <action>
    1. At the registrar's DNS management panel, add:
       - A record: name=@ (or blank), value=76.76.21.21, TTL=60
       - CNAME record: name=www, value=cname.vercel-dns.com, TTL=60
    2. Wait 24–48 hours for DNS propagation.
    3. After propagation, verify:
       - Run: curl -I https://groupio.co.il
       Expected: HTTP/2 200 (or 301/302 to app) and valid SSL header
       - Run: openssl s_client -connect groupio.co.il:443 -servername groupio.co.il < /dev/null 2>&1 | grep "Verify return code"
       Expected: "Verify return code: 0 (ok)"
    4. Record SSL verification date in ops runbook.
  </action>
  <acceptance_criteria>
    - `curl -I https://groupio.co.il` returns HTTP 200 or 30x with a valid SSL certificate (no SSL error)
    - `openssl s_client -connect groupio.co.il:443 -servername groupio.co.il < /dev/null 2>&1 | grep "Verify return code: 0"` succeeds
    - Vercel Dashboard shows groupio.co.il as "Valid Configuration" with green SSL indicator
  </acceptance_criteria>
</task>

---

## must_haves

- groupio.co.il registered and active
- DNS A record → 76.76.21.21 configured at registrar
- SSL certificate valid: `curl -I https://groupio.co.il` returns 200 with no SSL errors

---

<threat_model>
## Threat Model (ASVS L1)

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Domain hijacking / registrar account compromise | HIGH | Enable 2FA on registrar account immediately after registration. Use a company email, not personal. |
| DNS propagation delay blocks launch | LOW | Register Day 1; 24-48h propagation is expected. SSL auto-provisions minutes after DNS verifies. |
| api.groupio.co.il subdomain ambiguity | MEDIUM | Flag as open question in runbook. D-02 path-based routing conflicts with deploy.yml smoke test expecting subdomain. Resolve in Phase 3. |
| Domain expiry causes outage | MEDIUM | Register for 2 years; set calendar reminder 60 days before expiry. ISOC-IL does not auto-renew. |
</threat_model>
