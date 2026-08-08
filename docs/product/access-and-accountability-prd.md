# PRD — Access and Accountability

**Produs:** PRISMA-PRIM Suite  
**Capacitate MVP:** Access and Accountability  
**Statut:** Ready for ticketed implementation  
**Versiune:** 1.0  
**Data:** 2026-08-08  
**PRD părinte:** [PRISMA-PRIM Suite MVP](./mvp-prd.md)

## 1. Scop

Această capacitate oferă acces sigur, bazat pe invitație, la aplicația internă și leagă identitatea fiecărui utilizator de acțiunile sale de business. Ea stabilește fundația minimă pe care se vor baza toate fluxurile ulterioare pentru Client, Client Request, Analysis, Pricing, Offer, Contract și Approved Knowledge.

MVP-ul folosește Clerk ca furnizor extern de identitate, dar modelul de business nu depinde de tipurile Clerk. O identitate externă verificată este tradusă într-un `External Principal`, rezolvată idempotent către un `Internal User` local și asociată unicului `Workspace` persistent al pilotului.

Prima creare a unui `Internal User` trebuie să lase o urmă unică, atribuită și append-only în `Activity Log`.

## 2. Problema

Datele comerciale și contractuale nu pot fi expuse public, iar identitatea tehnică oferită de un furnizor extern nu este suficientă pentru trasabilitatea de business. Fără un model local stabil:

- schimbarea adresei de e-mail sau a numelui poate fragmenta istoricul;
- două cereri simultane pot crea utilizatori dubli;
- modulele viitoare pot ajunge să depindă direct de Clerk;
- acțiunile critice nu pot fi atribuite în mod reproductibil;
- un utilizator dezactivat poate rămâne autorizat accidental;
- mediile de test pot cere acces la un serviciu extern și pot deveni nedeterministe.

## 3. Rezultatul așteptat

Un colaborator invitat poate accepta invitația sau se poate autentifica prin Clerk, poate intra într-o rută protejată și este reprezentat în aplicație printr-un `Internal User` local unic. Shell-ul de producție afișează identitatea locală, API-ul refuză accesul neautentificat sau inactiv cu semantica potrivită, iar prima provisionare produce un singur eveniment vizibil în `Activity Log`.

## 4. Actori

- **Internal User:** colaborator PRISMA-PRIM sau BIC invitat. Toți utilizatorii activi au aceleași permisiuni în MVP.
- **Business Owner:** un `Internal User` care furnizează sau validează ulterior configurația reală de business. Nu primește un rol tehnic separat în această capacitate.
- **External Identity Provider:** Clerk, responsabil de invitație, autentificare și verificarea sesiunii.
- **Workspace:** proprietarul organizațional unic și persistent al datelor pilotului.

## 5. Povești de utilizator

1. Ca `Internal User`, vreau să intru numai printr-un flux de identitate bazat pe invitație, pentru ca datele interne să nu fie publice.
2. Ca `Internal User`, vreau ca identitatea mea locală să rămână aceeași când îmi actualizez numele sau e-mailul, pentru ca istoricul meu să nu fie fragmentat.
3. Ca `Internal User`, vreau să văd în aplicație cine sunt și în ce `Workspace` lucrez, pentru a evita acțiunile într-un context ambiguu.
4. Ca `Business Owner`, vreau ca utilizatorii inactivi să fie refuzați chiar dacă au încă o sesiune externă validă.
5. Ca `Internal User`, vreau ca prima mea provisionare să fie vizibilă în `Activity Log`, pentru ca accesul inițial să fie trasabil.
6. Ca echipă de dezvoltare, vrem teste deterministe fără acces la rețeaua Clerk, pentru ca integrarea continuă să fie stabilă.

## 6. Domeniu funcțional

### 6.1 Shell de producție

Înainte de accesul real, aplicația primește un shell minimal și reversibil inspirat de Atlas Blue. Acesta stabilește doar frontiera dintre navigație, zona utilizatorului și conținutul rutat. Nu reprezintă aprobarea definitivă a designului și nu extrage prematur întregul design system din `/ui-baseline`.

Snapshot-ul `/ui-baseline` rămâne izolat, sintetic și recuperabil. Modulele de producție nu îi importă fixture-urile sau componentele interne.

### 6.2 Identitate externă și `External Principal`

Backend-ul acceptă numai o identitate externă deja verificată de adaptorul runtime. Contractul neutru `External Principal` conține minimum:

- furnizorul;
- subiectul extern stabil;
- numele afișat;
- adresa de e-mail necesară interfeței.

Tipurile, tokenurile și claim-urile Clerk nu traversează frontiera modulului Access.

### 6.3 `Internal User` și `Workspace`

Prima rezolvare a unui subiect extern creează un singur `Internal User` activ în unicul `Workspace` persistent. Rezolvările repetate sau concurente întorc același utilizator.

Cheia de identitate este subiectul extern stabil împreună cu furnizorul, nu e-mailul. Numele și e-mailul pot fi sincronizate ca atribute de profil fără schimbarea identității locale.

`Workspace` are un identificator persistent și este creat sau inițializat printr-un mecanism unic, nu prin constante repetate în module.

### 6.4 `Actor Context`

Access expune consumatorilor un `Actor Context` minimal:

- `internalUserId`;
- `workspaceId`;
- `displayName`;
- `email`;
- starea activă necesară autorizării.

Consumatorii nu interoghează direct tabelele Access și nu primesc tipuri Clerk.

### 6.5 Semantica accesului

- Lipsa unui `External Principal` verificat produce `401 Unauthorized` și nu expune date de business.
- Un principal verificat asociat unui `Internal User` inactiv produce `403 Forbidden`.
- Runtime-ul de producție eșuează închis dacă adaptorul real nu este configurat corect.
- Adaptorul determinist este permis numai în teste și într-un mod local de demonstrație denumit explicit. Nu poate fi activat accidental într-un build sau runtime de producție.

### 6.6 Clerk

Frontend-ul folosește integrarea oficială Clerk pentru acceptarea invitației, autentificare, sesiune și sign-out. Backend-ul verifică identitatea cu integrarea server oficială și o traduce către contractul neutru.

Secretele nu sunt comise. Variabilele necesare sunt documentate prin nume și validate. Testele automate nu apelează Clerk și nu reproduc testele interne ale SDK-ului.

### 6.7 Accountability și `Activity Log`

Prima provisionare reușită înregistrează exact un eveniment canonic append-only. Evenimentul conține:

- `Workspace`;
- actorul `Internal User`;
- acțiunea canonică;
- ținta `Internal User`;
- timpul server-authoritative;
- metadata structurată minimală;
- o cheie de idempotency suficientă pentru a evita duplicatele.

Provisionarea și evenimentul au garanții atomice: un eșec nu lasă un eveniment de succes fals. Utilizatorul poate consulta evenimentele din Workspace în ordine cronologică inversă printr-un ecran minimal.

Accountability expune o interfață mică pentru înregistrarea evenimentelor canonice și o interfață de citire paginată. Nu este un logger tehnic și nu acceptă mesaje arbitrare ca model principal.

## 7. Invariante

- O identitate externă stabilă corespunde unui singur `Internal User` în `Workspace`.
- Idempotency este garantată de baza de date, nu numai de verificări în memorie.
- Nicio rută protejată nu livrează date înainte de stabilirea unui `Actor Context` activ.
- Niciun modul de business nu depinde de Clerk.
- Niciun token sau secret nu este persistat în `Activity Log` ori returnat API-ului de business.
- Evenimentele de business sunt append-only prin interfața publică.
- Timpul și actorul unui eveniment critic sunt stabilite de server.
- `/ui-baseline` rămâne independent de autentificarea și datele reale.

## 8. Interfețe publice intenționate

Numele exacte pot fi adaptate la convențiile existente ale repository-ului, dar responsabilitățile rămân stabile:

- adaptor extern: identitate verificată → `External Principal`;
- Access: `External Principal` → `Actor Context` idempotent;
- endpoint public current actor: returnează doar profilul local necesar shell-ului;
- Accountability write: `Actor Context` + acțiune canonică + țintă + metadata constrânsă;
- Accountability read: lista limitată a evenimentelor vizibile în Workspace.

Persistența, tranzacțiile, Drizzle, unicitatea, serializarea și detaliile providerului rămân private modulelor proprietare.

## 9. Date și migrații

Sunt necesare în forma minimă:

- un `Workspace` persistent;
- un `Internal User` cu legătura externă stabilă, profil și stare activă;
- un model append-only pentru `Activity Log` cu idempotency.

Fiecare schimbare Drizzle include o migrare revizuită. Constrângerile de unicitate și cheile străine trebuie să susțină invariantele inclusiv sub concurență. Nu se introduc tabele pentru roluri granulare, multi-tenancy comercial sau domenii viitoare.

## 10. Stări UI necesare

- shell neutru fără date business sintetice;
- signed out / redirect către autentificare;
- sesiune în curs de verificare;
- acces activ cu identitatea locală afișată;
- sesiune expirată și recuperare coerentă;
- utilizator inactiv / acces refuzat;
- listă minimală `Activity Log`, inclusiv empty și error state.

Comportamentul trebuie verificat la 1440×900 și 390×844, cu navigare keyboard, focus vizibil, landmarks semantice și fără overflow orizontal.

## 11. Strategie de testare

### Frontiera principală

Comportamentul Access și Accountability este testat prin API-ul REST public împotriva unei baze PostgreSQL reale de test. Testele observă codurile HTTP, răspunsurile publice și starea persistentă, nu structura metodelor private NestJS.

### Teste specializate

- concurență și idempotency pentru prima rezolvare;
- sincronizarea profilului fără schimbarea identității;
- separarea `401` de `403`;
- atomicitatea provisionării și a evenimentului;
- unicitatea și ordonarea evenimentelor;
- izolarea după `Workspace`;
- contractul de traducere al adaptorului Clerk;
- browser tests pentru shell, rută protejată, identitate și `Activity Log`;
- regresie care confirmă izolarea `/ui-baseline`.

Testele automate folosesc adaptorul determinist și nu necesită rețea externă. Integrarea Clerk primește suplimentar un smoke test manual documentat într-un mediu de test configurat.

Fiecare issue urmează red-green-refactor la cea mai stabilă frontieră publică și se încheie cu revizuire Standards, apoi Spec.

## 12. Ordinea de livrare

1. Alinierea guvernanței repository-ului la baseline-ul Atlas Blue evolutiv.
2. Shell de producție minimal și reversibil.
3. Access provider-neutral cu adaptor determinist și persistență reală.
4. Adaptor runtime Clerk și flux de invitație/autentificare.
5. Primul eveniment Accountability și ecranul minimal `Activity Log`.

Fiecare pas este o issue verticală sau o excepție de prefactoring delimitată, executabilă într-o sesiune Codex proaspătă. Dependențele sunt secvențiale.

## 13. În afara domeniului

- înregistrare publică;
- administrare de invitații în aplicație;
- roluri și permisiuni granulare;
- multiple Workspaces sau multi-tenancy comercial;
- SSO enterprise, politici MFA sau mai mulți identity providers;
- profil de utilizator complex;
- export, retenție, ștergere sau editare `Activity Log`;
- înregistrarea tuturor acțiunilor viitoare;
- Client, Request, Analysis, Pricing, Offer, Contract, Document sau AI;
- design system complet sau înghețarea direcției Atlas Blue.

## 14. Criterii de acceptare ale capacității

Capacitatea este completă când:

- un utilizator invitat se autentifică prin Clerk și ajunge în shell-ul protejat;
- identitatea sa externă este rezolvată idempotent într-un `Internal User` local din Workspace;
- shell-ul afișează identitatea locală;
- lipsa sesiunii produce `401`, iar utilizatorul local inactiv produce `403`;
- prima provisionare produce exact un eveniment vizibil și atribuit în `Activity Log`;
- retry-urile și concurența nu creează utilizatori sau evenimente duplicate;
- testele automate sunt deterministe și independente de Clerk;
- `/ui-baseline` rămâne intact;
- toate verificările repository-ului și journey-urile desktop/mobile trec.

## 15. Decizii amânate

Următoarele se decid numai când o capacitate reală le cere: administrarea utilizatorilor, roluri, mai multe Workspace-uri, SSO, retenția auditului și politici avansate de securitate. Aceste decizii nu trebuie anticipate în implementarea MVP.
