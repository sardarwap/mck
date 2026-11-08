HOW TO PUBLISH OdishaRank.in

1. Upload everything in this folder to any static host (Netlify "drag and drop", Cloudflare Pages, GitHub Pages, Firebase Hosting...).
2. Point your domain to it.

!! IMPORTANT – USE ONE ADDRESS ONLY !!
Students' Device IDs and progress are stored per website address. Choose ONE final address (for example https://odisharank.in) and redirect any other (www.odisharank.in, the free host address) to it. If the address changes later, students' Device IDs change and their old unlock codes stop working until you re-issue them.

3. Whenever you add tests: rebuild the site in the admin and upload again (replace all files). Existing unlock codes keep working.

Books in this build:
 - tests/practice-tests.html  (Practice Tests)
 - tests/sfs.html  (SFS)
 - tests/classmcqs.html  (Classmcqs)

AUTOMATIC PAYMENTS (Razorpay)
- The functions/ folder must stay at the ROOT of your GitHub repo (next to index.html). Cloudflare Pages deploys it automatically.
- In Cloudflare: Pages > your project > Settings > Variables and Secrets, add secrets RZP_KEY_ID, RZP_KEY_SECRET and BOOKS (use the Copy button in the admin Website tab). NEVER commit these to GitHub.
- Test with Razorpay TEST keys first (pay with a Razorpay test card/UPI), then switch to LIVE keys.
- EMAIL (optional): create a free Resend account (resend.com), verify your domain, then add secrets RESEND_API_KEY and MAIL_FROM (e.g. OdishaRank <orders@odisharank.in>).
- RESTORE LINK (optional but recommended): Cloudflare > Storage & Databases > KV > create a namespace, then Pages > Settings > Functions > KV namespace bindings > add variable name DEVICES.
- After changing prices or adding a class/pack, copy BOOKS again and update the secret.
