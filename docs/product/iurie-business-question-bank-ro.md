# Întrebări de business pentru Iurie — PRISMA-PRIM Suite

**Versiune:** 1.0  
**Scop:** bancă de întrebări pentru interviuri ghidate de agentul Codex al lui Iurie  
**Document de utilizare:** docs/product/iurie-business-interview-agent-handoff.md

## Cum folosim această listă

Aceasta este o bancă completă de întrebări, nu un formular care trebuie completat dintr-o dată. Agentul va alege o singură sesiune, va pune mai întâi întrebările P0 și va evita întrebările la care există deja un răspuns confirmat.

- **P0** — necesar pentru viziunea produsului sau pentru primele specificații operaționale;
- **P1** — necesar înainte de specificarea funcționalității respective;
- **P2** — detaliu important, dar poate fi clarificat mai târziu.

Pentru fiecare răspuns puteți spune:

- „confirm”;
- „cred că da, dar trebuie verificat”;
- „răspuns parțial”;
- „nu știu; trebuie întrebată persoana X”;
- „nu se aplică”.

Descrieți ce face echipa astăzi și ce ați dori să facă aplicația. Nu trebuie să propuneți o soluție tehnică.

Nu trimiteți parole, coduri de recuperare, chei, certificate digitale private, acces bancar, arhive complete de clienți sau documente confidențiale. Pentru exemple este suficientă o descriere sau o copie anonimizată.

## S00 — Organizațiile, responsabilitățile și sursele de adevăr

**Scop:** să înțelegem cine desfășoară fiecare activitate și ce informație poate fi considerată sigură.

1. **S00-Q01 · P0** — Ce activități și servicii desfășoară astăzi PRISMA-PRIM?
2. **S00-Q02 · P0** — Ce activități și servicii desfășoară astăzi BIC?
3. **S00-Q03 · P0** — Ce activități și servicii desfășoară astăzi ECG?
4. **S00-Q04 · P0** — Pentru ce tipuri de lucrări pot colabora două sau trei dintre aceste organizații la același client?
5. **S00-Q05 · P0** — Pentru fiecare tip de lucrare, care organizație răspunde față de client și care organizație semnează documentele?
6. **S00-Q06 · P0** — Ce informații despre un client pot fi comune grupului și ce informații trebuie să rămână numai la organizația care efectuează lucrarea?
7. **S00-Q07 · P0** — Cine sunt persoanele care folosesc sau vor folosi aplicația și care este responsabilitatea reală a fiecăreia?
8. **S00-Q08 · P0** — Cine trebuie să aibă o vedere asupra întregului grup și pentru ce activități?
9. **S00-Q09 · P0** — Ce decizii necesită obligatoriu aprobarea dumneavoastră? Ce decizii pot fi luate de alte roluri?
10. **S00-Q10 · P0** — Care sunt cele mai importante cinci probleme de lucru pe care aplicația trebuie să le reducă în primul rând?
11. **S00-Q11 · P0** — Care ar fi trei rezultate observabile care v-ar demonstra că prima versiune operațională este utilă?
12. **S00-Q12 · P0** — Ce clienți și proiecte reale, anonimizate, ar reprezenta bine cazurile simple, comune între organizații și dificile?
13. **S00-Q13 · P1** — Când două persoane descriu diferit aceeași regulă, cine sau ce document stabilește practica corectă?
14. **S00-Q14 · P1** — Ce informații importante există numai în memoria unei persoane și riscă să se piardă?
15. **S00-Q15 · P1** — Ce registre, foi de calcul, dosare sau aplicații sunt considerate astăzi sursa principală pentru clienți, proiecte, contracte, audituri, certificate și plăți?

**Exemple sau dovezi utile:** o listă a serviciilor pe organizații, o organigramă simplă, roluri reale și 3–5 cazuri anonimizate.

## S01 — Utilizatori, acces și responsabilitate

**Scop:** să stabilim cine poate vedea, crea, modifica, aproba și corecta informațiile.

1. **S01-Q01 · P0** — Ce categorii reale de utilizatori trebuie să existe la început?
2. **S01-Q02 · P0** — Pentru fiecare categorie, care sunt primele trei acțiuni pe care trebuie să le poată face?
3. **S01-Q03 · P0** — Cine invită o persoană nouă și cine confirmă organizația sau organizațiile la care poate lucra?
4. **S01-Q04 · P0** — Poate aceeași persoană lucra pentru PRISMA-PRIM și BIC? Dacă da, cum trebuie să aleagă contextul corect?
5. **S01-Q05 · P0** — Cine poate vedea informațiile generale despre același client în întregul grup?
6. **S01-Q06 · P0** — Ce informații despre proiecte, prețuri, contracte, audituri, certificate sau finanțe trebuie ascunse colaboratorilor altei organizații?
7. **S01-Q07 · P0** — Cine poate vedea o cerere nouă înainte de a se stabili organizația responsabilă?
8. **S01-Q08 · P0** — Pentru ce acțiuni este obligatorie verificarea sau aprobarea unei alte persoane?
9. **S01-Q09 · P0** — Ce acțiuni importante trebuie să păstreze întotdeauna cine le-a făcut, asupra cărui dosar și când?
10. **S01-Q10 · P0** — Ce trebuie să se întâmple imediat când un colaborator pleacă, își schimbă rolul sau își pierde dispozitivul?
11. **S01-Q11 · P1** — Ce acces limitat au nevoie auditorii externi, formatorii, experții, contabilii sau colaboratorii temporari?
12. **S01-Q12 · P1** — Un client extern trebuie să aibă acces la platformă? Dacă da, la ce rezultat concret și în ce etapă viitoare?
13. **S01-Q13 · P1** — Cine poate corecta o informație importantă și trebuie păstrată valoarea anterioară?
14. **S01-Q14 · P1** — Cine poate exporta informații și pentru ce scopuri?
15. **S01-Q15 · P1** — În ce situații suportul tehnic poate vedea date reale și cine trebuie să autorizeze accesul?
16. **S01-Q16 · P2** — Există perioade, proiecte sau tipuri de documente pentru care accesul trebuie limitat suplimentar?

**Exemple sau dovezi utile:** o matrice informală cu persoane/roluri și acțiuni, plus un exemplu de acces care ar fi periculos dacă ar fi prea larg.

## S02 — Clienți, entități juridice, proiecte și sarcini

**Scop:** să înțelegem dosarul comun al clientului, lucrările efective și urmărirea activităților.

1. **S02-Q01 · P0** — Cum recunoaște echipa că o organizație sau persoană este deja client?
2. **S02-Q02 · P0** — Ce date generale despre client trebuie să fie vizibile într-un singur dosar comun?
3. **S02-Q03 · P0** — Poate același grup de client să conțină mai multe companii, filiale sau persoane care primesc oferte ori semnează contracte diferite?
4. **S02-Q04 · P0** — Ce date identifică exact organizația sau persoana care va primi oferta și va semna contractul?
5. **S02-Q05 · P0** — Ce trebuie să se întâmple când apar două dosare care par să descrie același client?
6. **S02-Q06 · P0** — Cine poate confirma că două dosare reprezintă același client și ce istoric trebuie păstrat?
7. **S02-Q07 · P0** — Ce tipuri reale de proiecte sunt necesare pentru PRISMA-PRIM, BIC și ECG?
8. **S02-Q08 · P0** — Când se creează un proiect: la prima discuție, la ofertă, la contract, la începerea lucrării sau diferit după serviciu?
9. **S02-Q09 · P0** — Poate un proiect începe înainte de contract? Ce este permis până la semnare?
10. **S02-Q10 · P0** — Care organizație răspunde de un proiect și se poate schimba responsabilitatea după creare?
11. **S02-Q11 · P0** — Ce etape reale parcurge fiecare tip frecvent de proiect?
12. **S02-Q12 · P0** — În terminologia echipei, ce înseamnă exact „Stage 1”, „Stage 2”, „S1” și „S2”? Dați câte un exemplu.
13. **S02-Q13 · P0** — Ce diferență trebuie să vadă utilizatorul între starea generală a proiectului și etapa de lucru curentă?
14. **S02-Q14 · P0** — Ce sarcini apar obligatoriu la crearea unui proiect și care depind de tipul proiectului?
15. **S02-Q15 · P0** — Cine atribuie o sarcină, cine o execută și cine confirmă că este terminată?
16. **S02-Q16 · P0** — Ce dovadă sau document este necesar pentru a considera anumite sarcini complete?
17. **S02-Q17 · P1** — Pot exista mai multe standarde, ediții ale standardelor, locații sau organizații ale clientului în același proiect?
18. **S02-Q18 · P1** — Ce termene, dependențe și memento-uri sunt necesare pentru sarcini?
19. **S02-Q19 · P1** — Ce se întâmplă cu sarcinile nefinalizate când un proiect este suspendat, anulat, închis sau transferat?
20. **S02-Q20 · P1** — Ce informație trebuie păstrată când șablonul unui tip de proiect se schimbă după ce proiectul a început?
21. **S02-Q21 · P1** — Ce trebuie să arate imediat pagina principală a unui client despre proiectele active, istoric și acțiunile următoare?
22. **S02-Q22 · P1** — Ce înseamnă pentru dumneavoastră un dosar „complet” și cum trebuie arătată informația încă neverificată?

**Exemple sau dovezi utile:** zece clienți reprezentativi, trei proiecte de tipuri diferite, o listă de etape și o listă de sarcini recurente.

## S03 — Documente, șabloane, versiuni și dovezi

**Scop:** să definim cum sunt pregătite, aprobate, trimise, semnate, corectate și păstrate documentele.

1. **S03-Q01 · P0** — Care sunt principalele familii de documente folosite de PRISMA-PRIM, BIC și ECG?
2. **S03-Q02 · P0** — Pentru fiecare familie, cine pregătește, verifică, aprobă, semnează, trimite și păstrează documentul?
3. **S03-Q03 · P0** — Ce documente pot fi comune grupului și ce documente trebuie separate între organizații?
4. **S03-Q04 · P0** — Când este un fișier doar o ciornă și în ce moment devine o versiune oficială care nu mai trebuie schimbată în tăcere?
5. **S03-Q05 · P0** — Ce trebuie să se întâmple când se găsește o eroare înainte de aprobare, după trimitere sau după semnare?
6. **S03-Q06 · P0** — Cum trebuie să fie clar care versiune este actuală și care versiuni au fost înlocuite?
7. **S03-Q07 · P0** — Ce dovadă arată că o anumită versiune exactă a fost trimisă, primită, acceptată sau semnată?
8. **S03-Q08 · P0** — Ce documente primite din exterior trebuie păstrate exact în forma originală?
9. **S03-Q09 · P0** — Cine poate aproba modificarea unui șablon?
10. **S03-Q10 · P0** — Ce variante diferă după organizație, limbă, logo, semnatar, marcă sau tip de serviciu?
11. **S03-Q11 · P0** — Ce documente au nevoie de număr oficial și în ce moment se atribuie numărul?
12. **S03-Q12 · P0** — Ce se întâmplă cu numerele rezervate, dar neutilizate sau abandonate?
13. **S03-Q13 · P1** — Poate același document primit să fie folosit drept dovadă pentru mai multe proiecte sau organizații? Dați cazuri permise și interzise.
14. **S03-Q14 · P1** — Ce documente sunt confidențiale chiar și față de colaboratorii unei alte organizații din grup?
15. **S03-Q15 · P1** — Ce documente nu trebuie șterse și cât timp sunt păstrate astăzi?
16. **S03-Q16 · P1** — Ce trebuie să se întâmple cu documentele vechi când există o reclamație, un litigiu, o inspecție sau o suspendare?
17. **S03-Q17 · P1** — Ce formate trebuie să rămână editabile și pentru ce documente este suficient PDF-ul sau scanul?
18. **S03-Q18 · P2** — Ce convenții de nume și dosare funcționează bine și ce excepții produc confuzie?

**Exemple sau dovezi utile:** un șablon, o variantă aprobată, un istoric ciornă–aprobare, o corectare, o dovadă de trimitere și un document semnat, toate anonimizate.

## S04 — Cereri, activitate comercială, prețuri, oferte și contracte

**Scop:** să descriem drumul real de la primul contact până la lucru acceptat și contractat.

### Cereri și responsabilitate

1. **S04-Q01 · P1** — Prin ce canale poate veni o cerere nouă: telefon, email, recomandare, site, mesagerie sau altă cale?
2. **S04-Q02 · P1** — Ce informații trebuie păstrate imediat, chiar dacă persoana sau organizația nu este încă identificată complet?
3. **S04-Q03 · P1** — Cine citește și clasifică cererile noi pentru fiecare organizație?
4. **S04-Q04 · P1** — Când devine o cerere suficient de serioasă pentru a avea un responsabil și o acțiune următoare?
5. **S04-Q05 · P1** — Poate o cerere să producă lucrări separate pentru mai multe organizații din grup?
6. **S04-Q06 · P1** — Se poate muta responsabilitatea unei lucrări potențiale între PRISMA-PRIM, BIC și ECG? Cine decide și ce istoric trebuie păstrat?
7. **S04-Q07 · P1** — Ce cereri sunt respinse sau rămân fără continuare și ce motive trebuie înregistrate?
8. **S04-Q08 · P1** — Ce pași și denumiri folosește echipa de la primul contact până la acceptare, pierdere sau renunțare?
9. **S04-Q09 · P1** — După cât timp este util un memento pentru o cerere fără răspuns și cine îl primește?

### Servicii și preț

10. **S04-Q10 · P1** — Ce servicii vinde efectiv fiecare organizație?
11. **S04-Q11 · P1** — Ce informații sunt necesare pentru calcularea sigură a prețului fiecărui serviciu frecvent?
12. **S04-Q12 · P1** — Ce părți ale prețului sunt fixe și ce părți sunt calculate după reguli sau tabele?
13. **S04-Q13 · P1** — Ce taxe, monede, rotunjiri, deplasări, urgențe sau alte adaosuri apar în oferte?
14. **S04-Q14 · P1** — Ce reduceri sau prețuri excepționale există? Cine le propune și cine le aprobă?
15. **S04-Q15 · P1** — Poate același serviciu avea preț diferit după organizație, tip de client, țară, an sau altă condiție?
16. **S04-Q16 · P1** — Când metoda de calcul se schimbă, oferta veche trebuie să păstreze calculul folosit la momentul respectiv?
17. **S04-Q17 · P1** — Ce informații lipsă trebuie să oprească calculul și ce presupuneri pot fi acceptate numai dacă sunt vizibile?

### Oferte și negociere

18. **S04-Q18 · P1** — Ce documente numiți ofertă, deviz sau propunere comercială și cum diferă după organizație sau serviciu?
19. **S04-Q19 · P1** — Ce informații și anexe sunt obligatorii înainte de trimiterea unei oferte?
20. **S04-Q20 · P1** — Cine pregătește, verifică și aprobă oferta? Când este necesară o a doua aprobare?
21. **S04-Q21 · P1** — Ce greșeli trebuie să oprească întotdeauna trimiterea și ce avertismente pot fi acceptate cu explicație?
22. **S04-Q22 · P1** — Cum sunt numerotate ofertele, când se atribuie numărul și ce se întâmplă cu un proiect abandonat?
23. **S04-Q23 · P1** — Cum este trimisă oferta și ce dovadă se păstrează că exact acel document a ajuns la client?
24. **S04-Q24 · P1** — Cât timp este valabilă o ofertă și cine o poate prelungi sau retrage?
25. **S04-Q25 · P1** — La negociere se creează un document nou, datat, sau se modifică fișierul vechi? Cum se identifică oferta acceptată?
26. **S04-Q26 · P1** — Ce reprezintă acceptarea: exemplar semnat, email clar, comandă de achiziție sau altă dovadă? Cine confirmă suficiența dovezii?
27. **S04-Q27 · P1** — Cum trebuie înregistrate respingerea, lipsa răspunsului, expirarea și decizia internă de a nu continua?

### Contract și începerea lucrării

28. **S04-Q28 · P1** — Orice ofertă acceptată produce un contract sau există căi legitime de începere din alt document?
29. **S04-Q29 · P1** — Poate fi introdus un contract fără ofertă în aplicație, de exemplu un contract vechi, cadru, reînnoire sau migrare?
30. **S04-Q30 · P1** — Care entitate exactă a clientului și care organizație din grup semnează? Când trebuie confirmate?
31. **S04-Q31 · P1** — Cine pregătește, verifică și autorizează contractul?
32. **S04-Q32 · P1** — Ce clauze și șabloane sunt aprobate, cine răspunde de ele și cum se autorizează schimbările?
33. **S04-Q33 · P1** — Cum se numerotează contractele și cum diferă regulile între organizații și ani?
34. **S04-Q34 · P1** — Cum se semnează astăzi: hârtie, scan, semnătură electronică, comandă de achiziție sau altă dovadă?
35. **S04-Q35 · P1** — Dacă folosiți un serviciu de semnătură electronică, cum se numește, cine controlează contul organizației și ce rezultat doriți să fie mai ușor?
36. **S04-Q36 · P1** — Cine confirmă că un contract este complet semnat și poate produce efecte?
37. **S04-Q37 · P1** — Ce schimbări apar după semnare: acte adiționale, schimbări de domeniu, prelungiri, suspendări, încetări sau corectări?
38. **S04-Q38 · P1** — Poate exista proiectul înainte de semnare și cum se evită crearea unui proiect duplicat?
39. **S04-Q39 · P1** — Poate un contract acoperi mai multe proiecte sau un proiect poate fi guvernat de mai multe documente contractuale?
40. **S04-Q40 · P1** — Cine poate vedea și modifica prețuri, reduceri, oferte și contracte pentru fiecare organizație?
41. **S04-Q41 · P1** — Ce indicatori comerciali doriți zilnic și cum trebuie înțeles fiecare?
42. **S04-Q42 · P1** — Ce acțiuni comerciale trebuie să arate întotdeauna autorul și momentul?

**Exemple sau dovezi utile:** trei cereri, lista serviciilor, cinci calcule de preț, două versiuni negociate ale unei oferte, un contract obișnuit, un contract excepțional și un act adițional.

## S05 — Google Drive, email și Calendar

**Scop:** să descriem utilizarea reală și rezultatul dorit; verificarea tehnică va fi făcută de Dan și agentul său.

### Conturi și Drive

1. **S05-Q01 · P1** — Ce adrese Google folosesc colaboratorii implicați și care aparțin persoanelor, organizațiilor sau sunt comune?
2. **S05-Q02 · P1** — Grupul plătește Google Workspace? Cine administrează organizația și domeniile?
3. **S05-Q03 · P1** — Există conturi personale Gmail folosite pentru documente sau activitate oficială?
4. **S05-Q04 · P1** — Documentele sunt în spații comune administrate sau în dosarele personale ale utilizatorilor?
5. **S05-Q05 · P1** — Care este structura principală de dosare pentru PRISMA-PRIM, BIC și ECG?
6. **S05-Q06 · P1** — Documentele organizațiilor sunt separate sau amestecate? Ce dosare sunt partajate intenționat?
7. **S05-Q07 · P1** — Cine deține dosarele istorice ale clienților și există materiale inaccesibile, duplicate sau fără proprietar clar?
8. **S05-Q08 · P1** — Ce fișiere trebuie editate direct în Google și ce fișiere pot rămâne DOCX, XLSX sau PDF?
9. **S05-Q09 · P1** — Ce reguli de denumire și numerotare folosesc dosarele clienților și proiectelor?

### Email

10. **S05-Q10 · P1** — Ce rezultat doriți prin „integrarea emailului”: atașarea unui mesaj la client, importul anexelor, citirea firului, pregătirea unui răspuns, trimiterea sau detectarea răspunsului?
11. **S05-Q11 · P1** — Ce adrese sunt individuale și ce adrese sunt folosite în comun? Cum este organizat accesul comun astăzi?
12. **S05-Q12 · P1** — Aplicația poate doar pregăti un mesaj pentru verificare sau există cazuri în care ar trebui să trimită automat?
13. **S05-Q13 · P1** — Trebuie prelucrate toate mesajele sau numai cele selectate în mod explicit de utilizator?
14. **S05-Q14 · P1** — Ce mesaje și anexe pot fi păstrate în aplicație și unde rămâne copia oficială?
15. **S05-Q15 · P1** — Ce categorii de email nu pot fi trimise unui serviciu extern de inteligență artificială?

### Calendar

16. **S05-Q16 · P1** — Ce calendare există și cine le deține?
17. **S05-Q17 · P1** — Ce activități trebuie să creeze evenimente: audituri, instruiri, termene contractuale, expirări, proiecte sau sarcini?
18. **S05-Q18 · P1** — Dacă un eveniment este modificat direct în Calendar, ce rezultat doriți în aplicație?
19. **S05-Q19 · P1** — Cine primește invitații și memento-uri: utilizatori interni, contacte ale clientului sau colaboratori externi?
20. **S05-Q20 · P1** — În ce situații titlul evenimentului sau numele clientului nu trebuie să apară într-un calendar comun?

**Exemple sau dovezi utile:** lista administratorilor și domeniilor, rădăcinile dosarelor, un arbore de client/proiect, tipurile de adrese comune și calendarele existente, fără secrete.

## S06 — Audit, certificare și instruire

**Scop:** să separăm corect serviciile, responsabilitățile, deciziile, certificatele și instruirea. Aplicația nu poate crea prin ea însăși acreditare sau autoritate legală.

### Organizații, autorizații și imparțialitate

1. **S06-Q01 · P1** — Care organizație oferă consultanță sau sprijin de implementare și pentru ce servicii exacte?
2. **S06-Q02 · P1** — Care organizație efectuează audituri interne, de furnizor, de pregătire sau alte audituri fără scop de certificare?
3. **S06-Q03 · P1** — Care organizație efectuează audituri de certificare?
4. **S06-Q04 · P1** — Cine verifică dosarul și cine ia decizia finală de certificare?
5. **S06-Q05 · P1** — Care organizație emite legal fiecare tip de certificat?
6. **S06-Q06 · P1** — Care organizație organizează instruirea și emite dovezile de participare sau absolvire?
7. **S06-Q07 · P1** — Există certificarea competenței unei persoane, distinctă de un curs și examen? Dacă da, prin ce reguli și autorizație?
8. **S06-Q08 · P1** — Ce organizații sunt acreditate sau autorizate, de cine, pentru ce standarde, sectoare, țări și locații?
9. **S06-Q09 · P1** — Ce servicii sunt neacreditate, suspendate, limitate sau subcontractate și cum trebuie explicat acest lucru clientului?
10. **S06-Q10 · P1** — Cum este protejată imparțialitatea între consultanță și certificare?
11. **S06-Q11 · P1** — Ce mărci, logo-uri de acreditare și afirmații publice poate folosi fiecare organizație?

### Ciclul și planificarea auditului

12. **S06-Q12 · P1** — Ce tipuri de audit efectuați în realitate?
13. **S06-Q13 · P1** — Care este succesiunea normală pentru certificare inițială, supraveghere și recertificare?
14. **S06-Q14 · P1** — Poate un audit acoperi mai multe standarde, locații sau entități juridice ale clientului?
15. **S06-Q15 · P1** — Ce audituri pot fi la fața locului, la distanță sau hibride?
16. **S06-Q16 · P1** — Cum se formulează și cine aprobă domeniul certificării, excluderile, locațiile și edițiile standardelor?
17. **S06-Q17 · P1** — Cum se calculează astăzi durata auditului și ce factori o modifică?
18. **S06-Q18 · P1** — Cine propune și cine aprobă o reducere sau majorare a duratei?
19. **S06-Q19 · P1** — Ce informații și aprobări trebuie să conțină planul auditului?
20. **S06-Q20 · P1** — Ce roluri există în echipă: conducător, auditor, expert tehnic, observator, traducător, stagiar sau altele?
21. **S06-Q21 · P1** — Cum sunt aprobate și reînnoite competențele auditorilor și experților?
22. **S06-Q22 · P1** — Cum sunt declarate și verificate conflictele de interese?
23. **S06-Q23 · P1** — Ce combinații între planificare, audit, revizuire, decizie și emitere sunt interzise sau permise numai în anumite condiții?

### Liste de verificare, dovezi și neconformități

24. **S06-Q24 · P1** — De unde provin listele de verificare și cine aprobă conținutul lor?
25. **S06-Q25 · P1** — Ce referințe la standard pot fi păstrate fără a reproduce neautorizat text protejat?
26. **S06-Q26 · P1** — Ce răspunsuri sunt folosite pentru fiecare punct: aplicabil, conform, lipsă de dovadă, imposibil de verificat sau alt rezultat?
27. **S06-Q27 · P1** — Ce categorii și niveluri de constatări sau neconformități sunt folosite?
28. **S06-Q28 · P1** — Cine poate stabili forma finală și gravitatea unei constatări?
29. **S06-Q29 · P1** — Ce tipuri de dovezi sunt păstrate și unde?
30. **S06-Q30 · P1** — Ce se comunică la ședința de închidere și ce se poate modifica ulterior?
31. **S06-Q31 · P1** — Ce constatări necesită corecție, analiză a cauzei și acțiune corectivă?
32. **S06-Q32 · P1** — Ce termene se aplică și cine le poate prelungi?
33. **S06-Q33 · P1** — Cum trimite clientul planul și dovezile și cine le acceptă sau respinge?
34. **S06-Q34 · P1** — Cine verifică implementarea și eficacitatea?
35. **S06-Q35 · P1** — Ce cazuri deschise blochează raportul, decizia sau menținerea certificatului?
36. **S06-Q36 · P1** — Cine verifică și aprobă raportul de audit și ce se întâmplă dacă un raport transmis conține o eroare?

### Decizie și certificate

37. **S06-Q37 · P1** — Ce trebuie să conțină dosarul înainte de a fi pregătit pentru decizie?
38. **S06-Q38 · P1** — Ce decizii apar în practică: acordare, refuz, amânare, menținere, suspendare, restabilire, reducere sau retragere?
39. **S06-Q39 · P1** — Decizia este luată de o persoană sau de un comitet și poate conține condiții?
40. **S06-Q40 · P1** — Cum sunt tratate contestațiile și reclamațiile?
41. **S06-Q41 · P1** — Ce câmpuri apar obligatoriu pe fiecare tip de certificat?
42. **S06-Q42 · P1** — Cum se atribuie seria și numărul și ce identificator nu trebuie reutilizat niciodată?
43. **S06-Q43 · P1** — Ce limbi și combinații bilingve sunt necesare?
44. **S06-Q44 · P1** — Cum sunt tratate expirarea, suspendarea, restabilirea, reducerea domeniului, retragerea, corectarea și reemiterea?
45. **S06-Q45 · P1** — Ce înseamnă exact termenul „revocat” în practica dumneavoastră?
46. **S06-Q46 · P1** — Există un cod QR sau un registru public? Ce date pot fi publice și care trebuie protejate?
47. **S06-Q47 · P1** — Certificatele sau acreditările trebuie transmise unui registru extern? Cine administrează accesul?

### Instruire

48. **S06-Q48 · P1** — Care este catalogul actual de cursuri și ce organizație răspunde de fiecare?
49. **S06-Q49 · P1** — Cine aprobă obiectivele, materialele și modificările cursului?
50. **S06-Q50 · P1** — Cum sunt înregistrate înscrierea, prezența și absențele?
51. **S06-Q51 · P1** — Ce cursuri au test sau examen și ce reguli există pentru prag, repetare, contestație și validarea rezultatului?
52. **S06-Q52 · P1** — Ce document primește participantul: prezență, absolvire, reușită sau alt tip?
53. **S06-Q53 · P1** — Cine validează prezența, rezultatul și emiterea documentului?
54. **S06-Q54 · P1** — Ce date personale sunt necesare și cât timp trebuie păstrate dovezile?
55. **S06-Q55 · P1** — Verificarea publică a documentului unei persoane este necesară și permisă?

**Exemple sau dovezi utile:** audit intern, Stage 1 și Stage 2, supraveghere/recertificare, calcul de durată, plan, listă fără text protejat, neconformitate, raport, dosar de decizie, certificat activ și modificat, instruire și dovezi de acreditare.

## S07 — Urmărirea financiară

**Scop:** să stabilim ce trebuie urmărit operațional fără a transforma aplicația într-un sistem contabil complet.

1. **S07-Q01 · P1** — Ce program contabil, foi de calcul sau proces manual folosește fiecare organizație și cine răspunde de el?
2. **S07-Q02 · P1** — Cine pregătește datele, cine emite legal factura și cine o verifică?
3. **S07-Q03 · P1** — Cine înregistrează, verifică și confirmă plățile primite?
4. **S07-Q04 · P1** — Ce organizații folosesc e-Factura, pentru ce tranzacții și cine are autoritatea necesară?
5. **S07-Q05 · P1** — Ce facturi sunt emise în afara e-Factura și de ce?
6. **S07-Q06 · P1** — Doriți ca aplicația să urmărească, să pregătească, să importe, să exporte sau să emită legal facturi? Ordonați rezultatele după importanță.
7. **S07-Q07 · P1** — Ce reguli de numerotare există după organizație, tip de document și an?
8. **S07-Q08 · P1** — Care este situația fiscală și TVA a fiecărei organizații și cine o poate confirma?
9. **S07-Q09 · P1** — Ce cote, scutiri sau situații cu clienți străini apar în practică?
10. **S07-Q10 · P1** — Ce identificatori și adrese legale trebuie să apară și care este sursa lor oficială?
11. **S07-Q11 · P1** — Ce monede sunt folosite în realitate și cât de frecvent?
12. **S07-Q12 · P1** — Ce sursă și ce dată se folosesc pentru cursul valutar?
13. **S07-Q13 · P1** — Ce forme de plată contractuală există: avans, tranșe, etape, lunar, sold, reținere sau penalități?
14. **S07-Q14 · P1** — Poate o factură acoperi mai multe proiecte sau contracte?
15. **S07-Q15 · P1** — Poate o plată bancară acoperi mai multe facturi? Cine stabilește împărțirea și ce dovadă păstrează?
16. **S07-Q16 · P1** — Prin ce metode sunt primite plățile și cum ajunge informația la persoana care le verifică?
17. **S07-Q17 · P1** — Cum sunt tratate plățile parțiale, sumele în plus și sumele încă neatribuite?
18. **S07-Q18 · P1** — Cum sunt tratate rambursările, anulările, notele de credit și facturile de corectare?
19. **S07-Q19 · P1** — Ce dovadă trebuie păstrată pentru confirmarea sau anularea unei plăți?
20. **S07-Q20 · P1** — Cine poate corecta o eroare și ce acțiuni necesită aprobarea altei persoane?
21. **S07-Q21 · P1** — Cine poate vedea valori contractuale, facturi, plăți, restanțe și totaluri consolidate?
22. **S07-Q22 · P1** — Cine poate înregistra, confirma, anula, exporta sau configura informații financiare?
23. **S07-Q23 · P1** — Ce rapoarte se pregătesc, pentru cine și cât de des?
24. **S07-Q24 · P1** — Ce memento-uri sunt utile și cine le primește?
25. **S07-Q25 · P1** — Ce import sau export ar elimina cea mai multă muncă manuală?
26. **S07-Q26 · P2** — Ce reguli de păstrare, corectare și audit aplică contabilul?

**Exemple sau dovezi utile:** contract achitat integral, contract în tranșe, întârziere, valută străină și o anulare/corectare, toate anonimizate.

## S08 — Istoric, migrare, căutare și export

**Scop:** să păstrăm istoricul cu proveniență și să definim cum găsesc utilizatorii informația.

1. **S08-Q01 · P1** — Unde se află informațiile istorice despre clienți și proiecte: aplicații, foi de calcul, email, Drive, hârtie sau fișiere personale?
2. **S08-Q02 · P1** — Ce sursă este considerată mai sigură când două surse se contrazic?
3. **S08-Q03 · P1** — Ce identificatori ajută la recunoașterea aceluiași client, entități juridice, contract, proiect sau certificat?
4. **S08-Q04 · P1** — Ce informații istorice sunt cunoscute ca incomplete, neactuale sau nesigure?
5. **S08-Q05 · P1** — Cine poate confirma că două înregistrări vechi descriu același client?
6. **S08-Q06 · P1** — Ce informații vechi trebuie păstrate exact așa cum au fost scrise, chiar dacă sunt corectate ulterior?
7. **S08-Q07 · P1** — Care zece clienți reprezintă bine cazurile simple, cu mai multe organizații, cu istoric lung și cu probleme?
8. **S08-Q08 · P1** — Ce își amintesc oamenii când caută: nume, IDNO, persoană, număr, standard, nume de fișier sau alt indiciu?
9. **S08-Q09 · P1** — Apar variante românești, rusești, chirilice, latine sau ortografii diferite pentru aceeași persoană ori organizație?
10. **S08-Q10 · P1** — Ce rezultate istorice sau arhivate trebuie afișate imediat și ce rezultate numai la cerere?
11. **S08-Q11 · P1** — Ce trebuie să apară când utilizatorul cere „tot ce avem despre acest client”?
12. **S08-Q12 · P1** — Cum trebuie diferențiată informația lipsă de informația încă neverificată?
13. **S08-Q13 · P1** — Ce informații din rezultate trebuie ascunse între organizațiile grupului?
14. **S08-Q14 · P1** — Ce exporturi sunt necesare, cine le folosește și pentru ce scop?

**Exemple sau dovezi utile:** inventarul surselor, exporturi reprezentative, duplicate, variante de nume și zece întrebări reale de căutare.

## S09 — Surse aprobate de cunoaștere și ajutor prin inteligență artificială

**Scop:** să definim ajutorul util și controlabil, bazat pe surse aprobate, fără decizii automate periculoase.

1. **S09-Q01 · P1** — Ce surse trebuie să fie considerate de încredere pentru răspunsurile curente?
2. **S09-Q02 · P1** — Cine aprobă o procedură, interpretare, listă, formular sau material de instruire?
3. **S09-Q03 · P1** — Cum știe echipa că o sursă este învechită sau înlocuită?
4. **S09-Q04 · P1** — Ce materiale sunt proprietatea organizației, licențiate, confidențiale, specifice clientului sau interzise pentru folosirea de către AI?
5. **S09-Q05 · P1** — Poate informația unei organizații sau a unui client ajuta vreodată altă organizație ori alt client? Dați limite concrete.
6. **S09-Q06 · P1** — În ce limbi trebuie înțelese întrebările și oferite răspunsurile pentru fiecare caz?
7. **S09-Q07 · P1** — Ce trebuie să facă asistentul când două surse aprobate se contrazic sau când nu există răspuns?
8. **S09-Q08 · P1** — Care sunt 3–5 întrebări despre dosarul unui client sau proiect care ar economisi cel mai mult timp?
9. **S09-Q09 · P1** — Ce documente lipsă, contradicții sau termene ar trebui să identifice asistentul?
10. **S09-Q10 · P1** — Ce proiecte de texte ar fi utile și cine trebuie să verifice fiecare tip?
11. **S09-Q11 · P1** — Ce sugestii sunt utile, dar nu trebuie aplicate niciodată automat?
12. **S09-Q12 · P1** — Ce greșeli ar fi doar incomode și ce greșeli ar putea provoca prejudicii comerciale, juridice sau de acreditare?
13. **S09-Q13 · P1** — Ce explicație și ce sursă exactă trebuie văzute înainte ca utilizatorul să aibă încredere într-o recomandare?
14. **S09-Q14 · P1** — Cum trebuie utilizatorul să corecteze, să respingă sau să raporteze un răspuns slab?
15. **S09-Q15 · P1** — Ce îmbunătățire măsurabilă ar justifica păstrarea fiecărei funcții AI?

**Exemple sau dovezi utile:** sursă aprobată și versiune veche, întrebări cu răspuns cunoscut, contradicții, date lipsă, exemple românești/rusești/engleze și răspunsuri inacceptabile.

## S10 — Continuitate, informații sensibile și administrare

**Scop:** să înțelegem impactul asupra afacerii dacă sistemul sau un furnizor nu funcționează.

1. **S10-Q01 · P0** — Cine administrează domeniile, Google Workspace, Drive, Synology și celelalte conturi importante?
2. **S10-Q02 · P0** — Cine trebuie contactat când aplicația sau o integrare nu funcționează?
3. **S10-Q03 · P0** — Ce perioade sau activități nu pot tolera o întrerupere lungă?
4. **S10-Q04 · P0** — Dacă sistemul se oprește, ce lucru poate continua manual și ce este blocat?
5. **S10-Q05 · P0** — Câtă muncă introdusă recent ar putea fi reintrodusă după un incident grav?
6. **S10-Q06 · P0** — În cât timp trebuie restabilite informațiile despre clienți, proiecte, audituri, certificate și plăți?
7. **S10-Q07 · P0** — Ce informații ar provoca cel mai mare prejudiciu dacă ar fi văzute de persoana, organizația sau partea externă greșită?
8. **S10-Q08 · P0** — Cine lucrează de pe dispozitive personale, calculatoare comune, de la distanță sau de pe telefon?
9. **S10-Q09 · P0** — Ce trebuie făcut imediat când un dispozitiv se pierde?
10. **S10-Q10 · P1** — Ce profesioniști externi sau colaboratori temporari au nevoie de acces limitat?
11. **S10-Q11 · P1** — Ce copii de siguranță au fost efectiv restaurate și verificate?
12. **S10-Q12 · P1** — Cine poate autoriza accesul excepțional al suportului la datele de lucru?
13. **S10-Q13 · P1** — Ce registre trebuie să rămână disponibile dacă Google, Synology sau un serviciu AI este indisponibil?
14. **S10-Q14 · P1** — Ce exporturi standard ar fi necesare dacă grupul ar schimba furnizorul aplicației?
15. **S10-Q15 · P1** — Ce model Synology există, cine îl întreține și ce rezultat de backup sau recuperare este cunoscut? Dacă nu știți, cine poate verifica?
16. **S10-Q16 · P1** — Ce categorii de date personale, confidențiale, de acreditare sau de client necesită reguli mai stricte sau interzic folosirea AI?

**Dovezi utile:** proprietarii organizaționali ai conturilor, o dovadă de restaurare, persoanele de contact și clasificarea informațiilor. Nu sunt necesare secrete sau detalii care ar facilita un atac.

## S11 — Utilizare zilnică, limbi, configurare, notificări și indicatori

**Scop:** să facem aplicația clară pentru rolurile reale și situațiile reale de lucru.

1. **S11-Q01 · P0** — Pentru fiecare rol, care sunt primele trei lucruri pe care trebuie să le realizeze într-o zi normală?
2. **S11-Q02 · P0** — Ce întrebări trebuie să răspundă imediat pagina principală a unui client?
3. **S11-Q03 · P0** — Când este utilă o vedere consolidată a grupului și când trebuie să fie vizibilă numai o organizație?
4. **S11-Q04 · P0** — Ce acțiuni sunt făcute frecvent de pe telefon în vizite, audituri sau deplasări?
5. **S11-Q05 · P0** — Ce aprobări, excepții sau lucrări întârziate au nevoie de o listă dedicată de acțiuni?
6. **S11-Q06 · P0** — Ce detalii complexe ar trebui ascunse până când utilizatorul are nevoie de ele?
7. **S11-Q07 · P0** — Ce greșeli sunt provocate astăzi de ecrane, dosare, denumiri sau pași neclari?
8. **S11-Q08 · P0** — Cine are nevoie de română, rusă sau engleză și pentru ce ecrane și documente?
9. **S11-Q09 · P0** — Ce cuvinte folosește echipa pentru etape, audituri, certificate, oferte și contracte?
10. **S11-Q10 · P0** — Ce termeni trebuie să difere după organizație fără a schimba sensul activității?
11. **S11-Q11 · P0** — Ce memento-uri trebuie afișate în aplicație?
12. **S11-Q12 · P0** — Ce memento-uri trebuie trimise și prin email sau Calendar?
13. **S11-Q13 · P0** — Când trebuie repetat sau escaladat un memento și când ar deveni deranjant?
14. **S11-Q14 · P0** — Ce indicatori sunt folosiți cu adevărat pentru decizii?
15. **S11-Q15 · P0** — Cum trebuie înțeles fiecare indicator după organizație, perioadă și monedă?
16. **S11-Q16 · P1** — Ce trebuie să vadă utilizatorul când nu există date, când nu are drept de acces, când o salvare eșuează sau când o integrare nu răspunde?
17. **S11-Q17 · P1** — Ce setări trebuie să poată modifica responsabilul organizației și ce schimbări trebuie aprobate?
18. **S11-Q18 · P1** — Ce schimbări de termeni, șabloane, reguli sau indicatori trebuie să păstreze versiunea veche pentru dosarele istorice?
19. **S11-Q19 · P2** — Ce activități repetitive ar beneficia de selecție și acțiune asupra mai multor elemente, cu previzualizare înainte de confirmare?

**Exemple sau dovezi utile:** o zi de lucru pentru fiecare rol, situații mobile, lista termenilor, memento-uri reale, indicatori și erori din care utilizatorii trebuie să se poată recupera.

## Închiderea fiecărei sesiuni

La sfârșit, agentul trebuie să îi citească lui Iurie un rezumat scurt:

1. ce se întâmplă astăzi;
2. ce rezultat trebuie să ofere aplicația;
3. cine acționează, verifică, aprobă și poate vedea informația;
4. ce excepții importante există;
5. ce exemple sau dovezi sunt disponibile;
6. ce răspunsuri trebuie verificate și de cine.

Iurie confirmă sau corectează rezumatul. Agentul păstrează ID-urile întrebărilor, astfel încât Dan și agentul său să poată transforma răspunsurile în specificații și criterii de acceptare fără a-i cere lui Iurie să înțeleagă sau să aleagă implementarea tehnică.
