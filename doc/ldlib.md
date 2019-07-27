Libreria ldlib
===============

La libreria ldlib estende la libreria rdflib aggiungendo alcune features:

- dereferenziazione automatica degli uri
- gestione autenticazione tramite webid o basic httpauth

ldlib aggiunge  i seguenti metodi dell'oggetto store:

- **store.anyRef** 
- **store.eachRef** 
- **store.addRewriteRules** 

Le prime due funzioni si comportano come i metodi presenti nella libreria rdflib ma, se la funzione
originale non trova nulla nello store, verifica che il soggetto sia stato dereferenziato e in 
caso negativo lo dereferenzia e riprova come nel seguente pseudo code:

```
method anyRef (uri, property) {
	result = store.any (uri, property);
	if not result then
		dereference
}
```
 
Di fatto le nuove funzioni creano automaticamente e chiamano un opportuno fetcher per caricare automaticamente nello store le informazioni dereferenziate da un uri semantico.



Esempio di uso:

```
const $rdf = require(‘ldlib’)
const store  = $rdf.graph();
const me = store.sym('http://example.com/alice/card#me');
const FOAF = $rdf.Namespace('http://xmlns.com/foaf/0.1/');

let name = store.anyRef(me, VCARD(‘fn’)) || store.anyRef(me, FOAF(‘name’));
let picture = store.anyRef(me, VCARD(‘hasPhoto’)) || store.anyRef(me, FOAF(image));
let names = store.eachRef(me, VCARD(‘fn’)).concat(store.eachRef(me, FOAF(‘name’)));
```

In questo caso alla prima chiamata store.anyRef(me, VCARD(‘fn’)) ldlib cercherà di caricare nello store il contenuto del file 'https://example.com/alice/card'usando le regole descritte nelle [specifiche w3c](https://www.w3.org/2001/tag/doc/httpRange-14/2007-05-31/HttpRange-14).

In pratica ldlib tenta di caricare la risorsa URI considerandola come URL ma passando come header http 
"accept text/turtle" e gestendo le eventuali ridirezioni con Response Code 303.

## rewrite rules

Per evitare un accesso eccessivo alla rete ldlib è in grado di forzare alcune regole di riscrittura degli uri prima di passare alla dereferenziazione standard. Di fatto una implementazione molto semplificata di quanto fa il module "mod_rewrite" di apache.

Tramite il metodo *addRewiteRules* è possibile indicare allo store un array di regole di riscrittura .  Una regola di riscrittura è composta da due :

- una espressione regolare (*regexp*) che viene applicata all'uri
- il template utilizzato per riscrivere l'uri (*target*) chee può riferire gruppi presenti nella

Le regole sono valutate in sequenza e solo la prima regola la cui espressione regolare matcha l'uri è applicata.

Se nell'esempio precedente, dopo la creazione dell store si aggiunge la seguente istruzione:

```
store.addRewiteRules( [
	{
		"regexp": "https://example.com/(.*)/card" ,
		"target": "https://data.example.com/$1.ttl"
	}
]);
```

La dereferenziazione dell'uri http://example.com/alice/card#me avverrà caricando il file "https://data.example.com/alice.ttl"

## gestione caching

La dereferenziazione può avvenire solo una volta per ogni uri

ldlib mantiene in memoria  un hash degli url caricati. 


## gestione autenticazione

Se l'accesso