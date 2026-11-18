# DevOps & SRE Skill Bank

My personal knowledge base for DevOps, SRE, Kubernetes and multi-cloud: notes, runbooks and hands-on labs.

Built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) and hosted free on GitHub Pages.
Every push to `main` builds and deploys the site through GitHub Actions.

**Live site:** https://YOUR_GITHUB_USERNAME.github.io/devops-skill-bank/

## First-time setup

1. Create an empty **public** repo on GitHub named `devops-skill-bank` (no README, no .gitignore).
2. Replace `YOUR_GITHUB_USERNAME` (and `YOUR_LINKEDIN`) in `mkdocs.yml`, `README.md` and `docs/about.md`.
3. Push this folder:

   ```bash
   cd devops-skill-bank
   git init -b main
   git add .
   git commit -m "Initial skill bank site"
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/devops-skill-bank.git
   git push -u origin main
   ```

4. On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
5. Open the **Actions** tab, wait for the "Deploy site to GitHub Pages" run to go green, then visit the live URL.
   If the first run failed because Pages wasn't enabled yet, click **Re-run all jobs**.

## Run it locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
mkdocs serve        # http://127.0.0.1:8000 with live reload
```

## Adding a new skill note

1. Copy `docs/note-template/skill-note.md` into the right section folder, e.g. `docs/kubernetes/helm.md`.
2. Fill it in.
3. Add it under `nav:` in `mkdocs.yml`.
4. Commit and push. The site updates in about a minute.

## Layout

```
docs/
├── index.md              # Home
├── about.md              # About me + certifications
├── kubernetes/           # K8s notes and runbooks
├── cloud/                # AWS, Azure, GCP
├── sre/                  # SLOs, incidents, postmortems
├── ci-cd/                # Pipelines
├── iac/                  # Terraform
├── linux/                # Linux troubleshooting
├── security/             # Cloud security learning path
└── note-template/        # Template for new notes
```

## Custom domain (optional)

Add a file `docs/CNAME` containing your domain (e.g. `skills.example.com`), create a DNS `CNAME`
record pointing to `YOUR_GITHUB_USERNAME.github.io`, then set the domain under **Settings → Pages**
and tick **Enforce HTTPS**.
