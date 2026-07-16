# AEGIS Implementation Handbook — Document 01
# Oracle VM Provisioning

**Prerequisite:** You have read Document 00.
**Outcome of this document:** A running Oracle Cloud VM you can SSH into, with the ports AEGIS needs opened.
**Time:** 30–90 minutes, mostly waiting. Longer if you hit the capacity error (explained below — it's normal).

---

## BEFORE YOU START — ONE IMPORTANT CURRENT FACT

In June 2026, Oracle **cut** its Always Free ARM allocation in half: from 4 OCPU / 24GB RAM down to **2 OCPU / 12GB RAM**. Many older guides and blog posts still say 4/24 — those are out of date. If you follow an old guide and set 4 OCPU, on a free account your instance will eventually be **stopped by Oracle** until you resize it down.

This handbook uses **2 OCPU / 12GB**, which is the current free maximum and is enough for AEGIS in `INFERENCE_MODE=external` (the default — no large model runs on the VM itself; Cerebras and Groq do the heavy inference over the network).

---

## STEP 1 — CREATE THE ORACLE CLOUD ACCOUNT

Open a browser and go to: `https://www.oracle.com/cloud/free/`

Click **Start for free**.

Fill in the signup form. Notes on specific fields:
- **Country:** Choose India (this sets your "home region," which matters for the free tier).
- **Card:** A credit or debit card is required. This is for identity verification only.

**Why:** Oracle's genuinely-free resources ("Always Free") only exist in your account's home region, which is fixed at signup and cannot be changed later. Getting the region right now matters because doing it wrong means re-creating the whole account.

**Expect:** Email and phone verification steps, then a "your account is being provisioned" message. Account provisioning can take a few minutes to (rarely) a couple of hours.

**If wrong:** If your card is rejected (a known issue for some Indian cards on Oracle), the most common fix is trying a different card, or a card from a different bank. This is an Oracle-side quirk, not something you're doing wrong.

---

## STEP 2 — LOG IN AND FIND THE CONSOLE

Once your account is ready, log in at `https://www.oracle.com/cloud/sign-in.html`.

You land in the **OCI Console** — Oracle's web dashboard for everything. You'll use this for the next several steps.

**Why:** Everything about creating and managing your VM happens through this console. Get comfortable that this is "home base" for cloud operations.

---

## STEP 3 — CONSIDER PAY-AS-YOU-GO (READ THIS BEFORE CREATING THE VM)

Here is the single most common frustration with Oracle's free tier, stated up front so it doesn't surprise you:

**When you try to create a free ARM (Ampere A1) instance, you will very likely get an error: "Out of host capacity."** This is extremely common — the free ARM instances are in high demand and Oracle often has none available in a given region at a given moment.

There are two ways to deal with this:
1. **Retry repeatedly.** Keep clicking Create every few minutes/hours until capacity frees up. Free, but can take hours or days depending on your region.
2. **Upgrade to Pay-As-You-Go (PAYG).** This gives you reliable access to capacity. Critically: **upgrading to PAYG does not make you start paying** — your Always Free resources stay free. PAYG just removes the guardrails and gives you priority for provisioning. You only get billed if you exceed the free limits (which this handbook is careful never to do). There's usually a small temporary card hold (~$100) that is released.

**Recommendation:** If you hit the capacity error more than a few times, upgrade to PAYG. It's the reliable path and stays free as long as you keep the instance at 2 OCPU / 12GB. To upgrade: in the console, look for an "Upgrade to Paid Account" / "Upgrade, keep Free Tier resources" banner or button.

**Why this is here before you create the VM:** so that when you hit the capacity error — and you likely will — you understand it's normal and you already know your options, instead of thinking you did something wrong.

---

## STEP 4 — CREATE THE VM

In the console:

1. Open the navigation menu (top-left hamburger icon) → **Compute** → **Instances**.
2. Click **Create Instance**.

Now fill in the creation form:

**Name:** `aegis-dev`

**Why this name:** This same instance is both your development machine and your production machine. Naming it `aegis-dev` is fine; it's just a label.

**Placement:** Leave the default (Oracle picks an availability domain). You may change this later if you hit capacity errors.

**Image and shape** — click **Edit** on this section:
- Under **Image:** click **Change image**, select **Canonical Ubuntu**, choose **22.04**, click **Select image**.
- Under **Shape:** click **Change shape** → select **Ampere** → check **VM.Standard.A1.Flex** → set **OCPUs to 2** and **Memory (GB) to 12** → click **Select shape**.

**Why Ubuntu 22.04 specifically:** Everything in this handbook — every `apt` command, every path — is written for Ubuntu 22.04. A different OS means different commands. Do not substitute.

**Why 2 OCPU / 12GB exactly:** That's the current free maximum (Step's opening note). More would eventually get your instance stopped on a free account; this is the safe ceiling.

**Networking:** Leave defaults, but confirm **"Assign a public IPv4 address"** is set to **Yes / checked**. You need this to reach the VM from the internet.

**Add SSH keys** — this is how you'll securely log in. You have two options:
- **Easiest:** Select **Generate a key pair for me**, then **download both the private and public key** immediately. Save them somewhere safe on your computer (e.g., a folder called `oracle-keys`). You cannot re-download the private key later — if you lose it, you lose access.
- **If you already have an SSH key:** Select **Upload public key file** and upload your existing `.pub` file.

**Boot volume:** Click Edit if needed and set the size to **100 GB**.

**Why 100GB:** AEGIS runs ~19 Docker services with their images and data volumes. The 47GB default is tight. 100GB is comfortable and still well within the free 200GB block-storage allowance.

3. Click **Create**.

**Expect:** The instance page shows "PROVISIONING" (orange), then after 2–5 minutes "RUNNING" (green). Once running, note the **Public IP address** shown on the instance's detail page — write it down, you need it constantly from here on.

**If wrong — "Out of host capacity":** This is the common error from Step 3. Options, in order of ease: (a) change the Availability Domain in the form and retry, (b) retry every few minutes, (c) upgrade to PAYG per Step 3. Do not interpret this as a mistake on your part.

---

## STEP 5 — OPEN THE PORTS AEGIS NEEDS

By default, Oracle only allows SSH (port 22) into your VM. AEGIS's web traffic needs ports 80 (HTTP) and 443 (HTTPS). You open these in two places — Oracle's firewall and the VM's own firewall.

### 5a — Oracle's firewall (the "Security List")

In the console:
1. Navigation menu → **Networking** → **Virtual Cloud Networks**.
2. Click your VCN (there's one, auto-created with your instance).
3. Click **Security Lists** in the left sub-menu, then click the **Default Security List**.
4. Click **Add Ingress Rules**. Add two rules:
   - Rule 1: **Source CIDR** `0.0.0.0/0`, **IP Protocol** TCP, **Destination Port Range** `80`.
   - Rule 2: **Source CIDR** `0.0.0.0/0`, **IP Protocol** TCP, **Destination Port Range** `443`.
5. Click **Add Ingress Rules** to save.

**Why:** `0.0.0.0/0` means "allow from anywhere on the internet" — correct for a public web app. Without these rules, Oracle's network blocks all web traffic to your VM even if AEGIS is running perfectly.

**Expect:** Two new rows appear in the ingress rules list, for ports 80 and 443.

### 5b — The VM's own firewall

Ubuntu also has its own firewall (`iptables`) that can block these ports even after Oracle's rule is added. You'll fix this on the VM itself — but you can't yet, because you haven't connected to the VM. **This is done in Document 02, Step 6.** It's noted here so you know the port-opening job isn't fully finished until then.

---

## GATE — DO NOT PROCEED TO DOCUMENT 02 UNTIL ALL OF THESE ARE TRUE

- [ ] The instance shows **RUNNING** (green) in the OCI console.
- [ ] You have written down the **public IP address**.
- [ ] You have the **SSH private key file** saved safely on your computer.
- [ ] Ingress rules for **ports 80 and 443** exist in the Default Security List.

If any box is unchecked, you are not done with Document 01. Resolve it before moving on — Document 02 assumes all four are true and will not work otherwise.

---

## YOU ARE DONE WITH THIS DOCUMENT WHEN

You have a running Oracle VM, its public IP, your SSH key, and the Oracle-level ports open. Move to Document 02.
