# TypeSafe data terms: what happens to prompt content

**PMDW**
Written 2026-09-23 by the `TypeSafeTerms` research subagent. It closes the gap flagged in `research/typesafe-ai.md` § *Needs Jo* (the question "Are TypeSafe's data terms acceptable for sending slice briefs, which contain repo text, to the API?"). Every document below was fetched this session. Read-only; the TypeSafe API was not called. This is a reading of published terms, not legal advice.

## Bottom line

**CITE**
Training: allowed as written. MCA §4.1 decides it: "TypeSafe will not, include Customer Data in a dataset used to train (i.e., to modify the model weights of) any artificial intelligence or machine learning models without Customer's prior consent" (https://typesafe.ai/legal/mca).

**CITE**
Retention: not zero. The same §4.1 grants TypeSafe a right "in perpetuity, [to use] any Customer Data (i) to derive and generate Telemetry", §4.3 lets TypeSafe "Process Telemetry without restriction, including to improve the Services", no retention period for Input is published, and zero data retention is enterprise-only, by email (https://typesafe.ai/legal/mca, https://docs.typesafe.ai/legal.md).

**GUESS** (inference, from the two clauses above)
Sending repo text is acceptable under the terms as written for text that may sit, undeleted and US-hosted, with a vendor that promises not to train on it; it is not acceptable for anything that must not persist off-machine (secrets, credentials, third-party confidential material) unless an enterprise ZDR arrangement is in place.

## What the terms say about prompt data

### Which document governs prompt content

**CITE**
The MCA defines prompts as Customer Data. https://typesafe.ai/legal/mca §4.1: "any data, files, queries, and other materials that Customer (including Customer Users or End Users) inputs or makes available to TypeSafe, including through the Services or any Customer Application integrated therewith (collectively, "**Input**")"; "such outputs, "**Output**," and, collectively with Input, "**Customer Data**"". §1 defines the Services as the Web Interface and "the TypeSafe-hosted application programming interface". The MCA page reads "Last updated Sep 19, 2026".

**CITE**
The DPA is incorporated into the MCA, but it only covers personal data. https://typesafe.ai/legal/mca §4.4: "The terms of the Data Processing Agreement currently available at https://typesafe.ai/data-processing are incorporated herein by reference." That URL redirected to https://typesafe.ai/legal/data-processing when fetched. The DPA's §1.1 scopes itself to "Customer Data that constitutes "personal data," "personal information," "personally identifiable information," or any analogous term under applicable Data Protection Law ("**Customer Personal Data**")". The DPA page reads "Last updated Apr 24, 2026".

**GUESS** (inference, from DPA §1.1)
Most repository text (code, docs, specs) is not personal data, so the DPA's processor-only and purpose-limitation commitments (§2.1, §2.2) do not reach it. For ordinary repo text, the MCA is the operative document. Names, emails, or other personal data inside a slice brief would fall under the DPA as well.

**CITE**
A separate signed agreement overrides the MCA. https://typesafe.ai/legal/mca preamble: if an entity has "ENTERED INTO A SEPARATE WRITTEN AGREEMENT REGARDING THE USE OF THE SERVICES ("SEPARATE AGREEMENT")… (I) THIS AGREEMENT WILL NOT APPLY TO YOU". §16.14: "If there are inconsistencies or conflicts between the terms of the body of this Agreement and the Order, the terms of the Order will control".

### Training use

**CITE**
MCA, https://typesafe.ai/legal/mca §4.1, last sentence: "The foregoing license does not grant TypeSafe the right to, and TypeSafe will not, include Customer Data in a dataset used to train (i.e., to modify the model weights of) any artificial intelligence or machine learning models without Customer's prior consent."

**CITE**
Privacy Policy, https://typesafe.ai/legal/privacy-policy (page reads "Last updated Nov 19, 2025"), under *Personal Data You Provide to Us → Services*: "We collect the personal data you provide when you use the Services, including your prompts, data, instructions, and other input ("Input"). We will not train or fine tune any artificial intelligence or machine learning models on your prompts or other Input." Under *How We Use the Personal Data We Collect*: "We (1) will not train or fine tune any artificial intelligence or machine learning models on Input, and (2) will not disclose any Input to a third party other than our service providers."

**CITE**
Docs, https://docs.typesafe.ai/models.md § *Data handling*: "Jev is not trained on customer requests or responses." § *Customizing Jev*: "Jev is not fine-tuned or LoRA-adapted with customer data… the same weights serve every account."

**CITE**
The carve-out that remains is Telemetry. https://typesafe.ai/legal/mca §4.3: ""**Telemetry**" means information generated in connection with the Services, such as technical logs, hashes, summary statistics and classifications, metrics, and learnings related to Customer's use of the Services. TypeSafe may Process Telemetry without restriction, including to improve the Services or TypeSafe's other products and services." §11 adds that TypeSafe retains "all intellectual property rights and other rights in and to the Services, Documentation, Telemetry".

**GUESS** (inference, from MCA §4.1 and §4.3 read together)
The no-training promise is defined narrowly as not modifying model weights with Customer Data. Telemetry derived from Customer Data ("classifications… and learnings") is outside that promise and may be used "without restriction". Whether "learnings" could include content-bearing derivatives of repo text is not defined in the terms.

### Retention

**CITE**
The MCA grants a perpetual right for three purposes. https://typesafe.ai/legal/mca §4.1: TypeSafe may Process "(a) during the Term, any… Input solely to perform its obligations… (b) during the Term, any Customer Data to provide the Services and calculate Fees, and (c) in perpetuity, any Customer Data (i) to derive and generate Telemetry, (ii) to monitor for fraud and abuse of the Services, and (iii) as necessary to comply with applicable Laws." §10.4 lists §4.1 and §4.3 among the sections that survive termination.

**CITE**
The MCA sets no retention period and allows backups to persist. https://typesafe.ai/legal/mca §10.3: "both during the Term, and following the date of expiration or earlier termination of the Agreement, TypeSafe will be under no obligation to store or retain Customer Data and may delete Customer Data at any time in its sole discretion. Customer Confidential Information may be retained in TypeSafe's standard backups notwithstanding any obligation to delete the applicable Confidential Information but will remain subject to this Agreement's confidentiality restrictions."

**CITE**
The DPA's retention clause (personal data only) gives no number either. https://typesafe.ai/legal/data-processing Schedule I §8 *Duration of Processing*: "Customer Personal Data will be retained for as long as necessary taking into account the purpose of the Processing, and in compliance with applicable laws, including laws on the statute of limitations and Data Protection Law."

**CITE**
The Privacy Policy gives no number. https://typesafe.ai/legal/privacy-policy § *Retention*: "We retain personal data about you for as long as reasonably necessary to provide you with the Services, or otherwise in support of our business or commercial purposes. When you request that we do so, we take measures to delete your personal data…"

**CITE**
The subprocessor list distinguishes storage from inference compute. https://trust.typesafe.ai/subprocessors (rendered in a browser this session; a plain fetch returned an empty JavaScript shell): Amazon Web Services, "Customer information for live requests is stored and processed on databases, caches and compute nodes within AWS"; Modal, Nebius, and CoreWeave each "Customer AI prompts are processed, but not stored, on compute nodes managed by" that provider.

**GUESS** (inference, from the AWS entry)
"Customer information for live requests is stored" on AWS databases and caches suggests some request data is persisted there. Whether that includes the `state` text itself, and for how long, is not stated anywhere fetched.

**CITE**
The Trust Center lists a retention control but no period. https://trust.typesafe.ai/controls, *Data and privacy*: "Data retention procedures established — The company has formal retention and disposal procedures in place to guide the secure retention and disposal of company and customer data." and "Customer data deleted upon leaving — The company purges or removes customer data containing confidential information from the application environment, in accordance with best practices, when customers leave the service." The procedures themselves are not published.

### Zero data retention

**CITE**
https://docs.typesafe.ai/legal.md: "We also offer zero data retention (ZDR) for enterprise customers. Contact privacy@typesafe.ai to learn more." https://docs.typesafe.ai/models.md § *Data handling* points to the same page for "details on zero data retention (ZDR) for enterprise customers".

**CITE**
No self-serve switch is documented. The docs index https://docs.typesafe.ai/llms.txt lists no ZDR, retention, or data-controls page; the only data-handling entries are *Legal* and *Models*. The MCA, DPA, and Privacy Policy fetched this session do not mention ZDR.

### Subprocessors and region

**CITE**
DPA https://typesafe.ai/legal/data-processing §3.1: "Customer provides general authorization for Typesafe to engage the following subprocessors as described in https://trust.typesafe.ai/subprocessors". §3.2: "Typesafe will provide Customer reasonable advance notice prior to appointing any new Subprocessor… Customer may object… within 15 days of the date of such notice".

**CITE**
The list at https://trust.typesafe.ai/subprocessors showed "1-6 of 6 results", every one located "USA":

| Type | Subprocessor | Category | Stated handling (verbatim) |
|---|---|---|---|
| CITE | Amazon Web Services | Cloud provider | "Customer information for live requests is stored and processed on databases, caches and compute nodes within AWS" |
| CITE | Modal | AI Infrastructure | "Customer AI prompts are processed, but not stored, on compute nodes managed by Modal" |
| CITE | Nebius | Cloud provider | "Customer AI prompts are processed, but not stored, on compute nodes managed by Nebius" |
| CITE | CoreWeave | Cloud provider | "Customer AI prompts are processed, but not stored, on compute nodes managed by CoreWeave" |
| CITE | Slack | Collaboration, Customer Comms | "Customers' own data may be submitted to us by them in Slack channels we create for support" |
| CITE | Google Workspace | Collaboration, Customer Comms | "Customer information and their data may be exchanged through our email and document provider, Google, at their request" |

**CITE**
Region. https://typesafe.ai/legal/privacy-policy § *International Visitors*: "The Services are hosted in the United States ("U.S.")." The DPA's §6 provides EU SCCs and the UK Addendum for transfers of personal data out of the EU and UK (https://typesafe.ai/legal/data-processing). No region choice or data-residency option appears in any document fetched.

**CITE**
MCA https://typesafe.ai/legal/mca §16.10: "TypeSafe may use subcontractors and permit them to exercise TypeSafe's rights, but TypeSafe remains responsible for their compliance with this Agreement".

### Other clauses that bear on sending repo text

**CITE**
Confidentiality. https://typesafe.ai/legal/mca §14.1 covers information "that should be reasonably understood to be proprietary or confidential due to its nature and the circumstances of its disclosure"; §14.2 permits disclosure "as permitted in this Agreement, including Section 4.1 (Use of Customer Data)"; §14.5 permits disclosure "of Customer Data… if required by Law, subpoena, or court order".

**CITE**
Customer's warranty over Input. https://typesafe.ai/legal/mca §5: "Customer represents, warrants, and covenants that it has… obtained (and will maintain) all rights, consents, and permissions necessary for TypeSafe to exercise the rights granted to it in this Agreement (including the rights granted with respect to Input)". §13.2(a) makes Customer defend TypeSafe against third-party claims "relating to Input".

**CITE**
Who is bound. https://typesafe.ai/legal/mca preamble (capitals in the original): a person using the Services on behalf of an entity agrees "ON BEHALF OF SUCH ENTITY FOR WHICH YOU ACT" and "REPRESENT[S] THAT YOU HAVE THE AUTHORITY TO BIND CUSTOMER TO THE AGREEMENT."

**GUESS** (inference, from MCA §5 and the preamble)
If slice briefs carry text from repositories owned by an employer or a client, the person holding the key warrants rights they may not personally hold. Which entity is the Customer on this key decides whose repositories may be sent.

**CITE**
Terms can change. https://typesafe.ai/legal/mca §16.7: updated versions become effective "on the date that is at least 60 days after the date on which TypeSafe provided such notice". The Privacy Policy's § *Changes* says a revised version "will be effective when it is posted".

**CITE**
Security. DPA https://typesafe.ai/legal/data-processing §5.2: notification "without undue delay and in any case within 72 hours" of a Security Incident (personal data only). The Trust Center overview https://trust.typesafe.ai/ lists "SOC 2" under *Compliance* and a "SOC 2 Type II - 2026" resource behind "Request access".

## What was not found

**CITE**
No published retention period for API Input or for request data stored on AWS. Checked: MCA, DPA, Privacy Policy, Trust Center overview, controls, and subprocessors (URLs below). §10.3 of the MCA says only that TypeSafe "may delete Customer Data at any time in its sole discretion".

**CITE**
No published ZDR terms: no scope, no enablement mechanism beyond "Contact privacy@typesafe.ai", no statement of whether ZDR removes the Telemetry right in MCA §4.1(c) or the backup retention in §10.3 (https://docs.typesafe.ai/legal.md).

**GUESS** (inference)
Whether any Order or Separate Agreement is attached to the key that would go into the 2.0 OMP profile is unknown; the MCA says such a document controls where it conflicts. Only the account holder's console or email would show it.

**GUESS** (inference)
The SOC 2 Type II report, which would describe the retention procedures, sits behind "Request access" at https://trust.typesafe.ai/ and was not requested.

**CITE**
No definition of "learnings" in MCA §4.3, and no statement of whether Telemetry may contain verbatim Input (https://typesafe.ai/legal/mca).

**CITE**
No data-residency or region-selection option. Every subprocessor is listed as "USA" (https://trust.typesafe.ai/subprocessors).

## URLs fetched

| Type | URL | Result |
|---|---|---|
| ACTION | https://docs.typesafe.ai/legal.md | Fetched, read in full |
| ACTION | https://docs.typesafe.ai/models.md | Fetched, read in full |
| ACTION | https://docs.typesafe.ai/llms.txt | Fetched, read in full (index only) |
| ACTION | https://typesafe.ai/legal/data-processing | Fetched, read in full |
| ACTION | https://typesafe.ai/data-processing | Redirected to https://typesafe.ai/legal/data-processing; same text |
| ACTION | https://typesafe.ai/legal/mca | Fetched, all 332 lines read |
| ACTION | https://typesafe.ai/legal/privacy-policy | Fetched, read in full |
| ACTION | https://typesafe.ai/privacy | Redirected to https://typesafe.ai/legal/privacy-policy; same text |
| ACTION | https://typesafe.ai/legal/terms | Fetched, read in full; governs the website only, not the API ("If you enter into a separate agreement… the terms of that separate agreement will govern") |
| ACTION | https://trust.typesafe.ai/subprocessors | Plain fetch returned an empty JavaScript shell (Vanta app); rendered in a headless browser, full list read |
| ACTION | https://trust.typesafe.ai/ | Plain fetch empty; rendered in a browser, overview read |
| ACTION | https://trust.typesafe.ai/controls | Rendered in a browser; *Data and privacy* section and first page of *Infrastructure security* extracted. Other control sections not read |

## Reconciled 2026-09-23 (Plumb)

Tinker independently fetched the same pages the same day (`/Users/jowolff/agent-scratch/tinker/phase5-prereq-tests/t3-typesafe-terms/REPORT.md`, all HTTP 200). No contradiction: both read MCA §4.1 (no training), DPA scoped to personal data, six US subprocessors, no retention period in days. Tinker additionally quotes DPA Schedule I §8 ("retained for as long as necessary taking into account the purpose of the Processing"), consistent with "no fixed period" above.
