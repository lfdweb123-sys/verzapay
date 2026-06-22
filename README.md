# Verzapay — Guide de déploiement

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Auth | Firebase Authentication (email/mdp + Google) |
| Base de données | Cloud Firestore |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Emails | Brevo (Sendinblue) |
| Paiements | Joonapay API |
| KYC | VerifyPro Africa API |
| Déploiement | Vercel Hobby |

## 1. Firebase Setup

### a) Créer le projet Firebase
1. Allez sur [console.firebase.google.com](https://console.firebase.google.com)
2. Créez un projet "verzapay"
3. Activez **Authentication** → Email/Mot de passe + Google
4. Activez **Cloud Firestore** en mode production
5. Activez **Cloud Messaging**

### b) Récupérer les clés client
Dashboard → ⚙️ Paramètres du projet → Vos applications → Web → copiez `firebaseConfig`

### c) Clé VAPID pour les push web
Dashboard → Cloud Messaging → Onglet "Configuration Web Push" → Générer une paire de clés VAPID

### d) Clé Admin (compte de service)
Dashboard → ⚙️ Paramètres → Comptes de service → Générer une nouvelle clé privée
→ Récupérez `project_id`, `client_email`, `private_key`

## 2. Service Worker FCM

Dans `/public/firebase-messaging-sw.js`, remplacez les valeurs de `firebaseConfig` par vos vraies valeurs Firebase (les mêmes que l'étape 1b).

## 3. Icônes PWA

Créez les icônes suivantes dans `/public/icons/` :
- `icon-192.png` (192×192px)
- `icon-512.png` (512×512px)

Vous pouvez utiliser [favicon.io](https://favicon.io) pour les générer depuis le logo Verzapay (fond bleu `#0C447C`, icône éclair blanche).

## 4. Variables d'environnement

Copiez `.env.example` → `.env.local` et renseignez toutes les valeurs :

```bash
cp .env.example .env.local
# Éditez .env.local avec vos valeurs
```

## 5. Déploiement sur Vercel Hobby

```bash
npm i -g vercel
vercel
```

Puis définissez les variables d'environnement soit via CLI (`vercel env add NOM_VARIABLE`), soit via l'interface : Dashboard Vercel → Votre projet → Settings → Environment Variables.

**Important pour `FIREBASE_PRIVATE_KEY` :** collez la clé telle quelle (avec les `\n`) dans l'interface Vercel — elle gère l'échappement automatiquement. Le code la reconvertit avec `.replace(/\\n/g, "\n")`.

## 6. Webhooks à configurer côté fournisseurs

| Fournisseur | URL à renseigner dans leur dashboard |
|---|---|
| Joonapay | `https://votre-domaine.vercel.app/api/webhooks/joonapay` |
| VerifyPro Africa | `https://votre-domaine.vercel.app/api/webhooks/verifypro` |

Pour VerifyPro, récupérez le `webhook_secret` généré et ajoutez-le comme `VERIFYPRO_WEBHOOK_SECRET` dans Vercel — il sert à vérifier la signature HMAC de chaque événement reçu.

## 7. Règles de sécurité et index Firestore — déploiement direct

Le projet inclut trois fichiers prêts à déployer avec la Firebase CLI :
`firestore.rules`, `firestore.indexes.json`, `firebase.json`.

```bash
npm install -g firebase-tools
firebase login
firebase use verzapay   # ou: firebase use --add, puis sélectionner le projet
firebase deploy --only firestore:rules,firestore:indexes
```

Cela déploie en une commande l'intégralité des règles de sécurité et des index composites — pas besoin de copier-coller manuellement dans la console.

**Principe des règles (`firestore.rules`)** : toutes les écritures financières ou sensibles (transactions, payouts, ledger, codes 2FA, messages de contact, invitations) sont bloquées côté client (`allow write: if false`). Elles ne passent que par vos routes API serveur, qui utilisent le Firebase Admin SDK et contournent ces règles. Le client ne peut que **lire** ses propres données.

**Première installation du compte admin** : aucune interface ne permet de devenir admin soi-même (volontairement). Pour promouvoir un premier compte admin, ouvrez Firebase Console → Firestore → collection `users` → votre document utilisateur → ajoutez manuellement le champ `isAdmin: true` (booléen). Tous les comptes admin suivants peuvent être promus de la même façon.

## 8. Index composites Firestore

Définis dans `firestore.indexes.json`, déployés automatiquement avec la commande ci-dessus :

| Collection | Champs | Usage |
|-----------|--------|-------|
| `companies` | `members` (array-contains) + `createdAt` | Liste des entreprises d'un marchand |
| `companies` | `createdAt` (desc) | Liste admin de toutes les entreprises |
| `notifications` | `uid` + `createdAt` (desc) | Notifications d'un utilisateur |
| `transactions` (collectionGroup) | `joonapayPaymentId` | Retrouver une transaction depuis un webhook |
| `payouts` (collectionGroup) | `joonapayPayoutId` | Retrouver un payout depuis un webhook |
| `invites` (collectionGroup) | `status` + `createdAt` (desc) | Invitations en attente |

Si une requête nécessite un index non prévu ici, Firestore affiche une erreur dans la console du navigateur avec un lien direct pour le créer en un clic — ou ajoutez-le manuellement dans `firestore.indexes.json` puis redéployez.

## 9. Test en local


```bash
npm install
cp .env.example .env.local
# Renseignez .env.local
npm run dev
# → http://localhost:3000
```

## 10. Architecture des données Firestore

```
users/{uid}
  ├── email, displayName, photoURL
  ├── createdAt, activeCompanyId
  ├── fcmTokens: string[]
  ├── isAdmin (booléen — promotion manuelle uniquement, voir section 7)
  └── twoFactorEnabled (booléen, true par défaut — 2FA email à chaque connexion)

companies/{companyId}
  ├── name, legalName, sector, country
  ├── ownerUid, members: string[]
  ├── kycStatus, kycVerificationId, kycSessionId, kycRiskLevel
  ├── commissionRate (0.015 = 1.5%)
  ├── apiKeyPublic (toujours visible)
  ├── apiKeySecretHash (hash scrypt — la clé en clair n'est JAMAIS stockée)
  ├── apiKeySecretGenerated, apiKeySecretLastFour, apiKeySecretCreatedAt
  ├── logoColor
  ├── walletBalance (solde net marchand, mis à jour uniquement côté serveur)
  ├── legalInfo { ifuNumber, rccmNumber, legalCategory, taxRegime, ownerFullName, address, activityDescription }
  │
  ├── transactions/{txId}
  │   ├── joonapayPaymentId, amount, commission, netAmount
  │   ├── method, status, customerName/Phone/Email
  │   └── createdAt, completedAt
  │
  ├── payouts/{poId}
  │   ├── joonapayPayoutId, amount, recipientPhone, recipientName
  │   ├── status, requestedBy, note
  │   └── createdAt, processedAt
  │
  ├── ledger/{entryId}
  │   ├── type (credit/debit), amount, balanceAfter
  │   └── reference, label, createdAt
  │
  └── invites/{inviteId}
      ├── email, role (Admin/Membre), invitedBy, token
      ├── status (pending/accepted/revoked)
      └── createdAt

notifications/{notifId}
  ├── uid, companyId, title, body, type
  ├── read (boolean)
  └── createdAt, link

twoFactorCodes/{uid}          — jamais lisible côté client
  ├── codeHash (scrypt), expiresAt, attempts
  └── createdAt

contactMessages/{messageId}   — jamais lisible côté client
  ├── name, email, subject, message, source (contact/support)
  ├── uid, companyId (optionnels)
  └── createdAt
```


  ├── uid, companyId, title, body, type
  ├── read (boolean)
  └── createdAt, link
```

## Logique de commission Verzapay

Taux par défaut : **1.5%** (`commissionRate: 0.015`), modifiable par entreprise directement dans Firestore (`companies/{companyId}.commissionRate`).

Calcul effectué côté serveur dans `/api/joonapay/payments` :
```
commission = amount × commissionRate
netAmount  = amount - commission
```

Le `netAmount` est crédité sur `walletBalance` du marchand **uniquement** lorsque le webhook Joonapay confirme que le paiement est `completed` — jamais au moment de la création du lien, pour éviter de créditer un paiement qui pourrait encore échouer.

## Ce qui reste à brancher manuellement

- **Premier compte admin** : à promouvoir manuellement dans Firestore (`users/{uid}.isAdmin = true`), voir section 7.
- **Numéro WhatsApp affiché** (Contact, Support) : actuellement basé sur le numéro déclaré dans vos documents légaux (`+229 62 75 87 03`) — à ajuster dans `src/components/contact-form.tsx` (`WHATSAPP_NUMBER`) si vous utilisez un autre numéro dédié au support.
- **Validation manuelle des payouts** si vous voulez une étape d'approbation avant l'appel au partenaire de paiement (actuellement le payout part directement à la création — vous pouvez ajouter un statut `pending` + bouton "Approuver" dans le tableau de bord Admin, sur le même modèle que la validation KYC déjà en place).
- **Webhook signature du partenaire de paiement** — le code actuel ne vérifie pas de signature HMAC sur ce webhook (la documentation publique ne précisait pas ce mécanisme) ; si votre partenaire en fournit une, ajoutez la vérification comme cela a été fait pour VerifyPro.
- **Domaine d'envoi Brevo** : pensez à vérifier votre domaine d'envoi (SPF/DKIM) dans Brevo pour une meilleure délivrabilité des emails (2FA, confirmations, notifications admin).

