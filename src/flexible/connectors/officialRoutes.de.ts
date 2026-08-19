import type { NormalizedJob, WorkplaceType } from '../../types'
import { makeOfficialSearch, makeOpenEntry } from '../opportunity'

export type OfficialRouteSector =
  | 'grocery' | 'retail' | 'drugstore' | 'logistics' | 'food' | 'hotel'
  | 'healthcare' | 'facilities' | 'staffing'

export type OfficialRoute = {
  id: string
  organization: string
  country: 'DE'
  sector: OfficialRouteSector
  integrationKind: 'official_search' | 'open_entry'
  officialUrl: string
  verifiedAt: string
}

/**
 * Verified official destinations. These are directory/fallback records, not APIs,
 * and are never executed through the Source Fabric proxy.
 */
export const FLEXIBLE_OFFICIAL_ROUTES_DE = [
  {"id":"denns-biomarkt","organization":"Denns Biomarkt","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://jobs.biomarkt.de/","verifiedAt":"2026-08-11"},
  {"id":"norma","organization":"NORMA","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://karriere.norma-online.de/de/karriere/","verifiedAt":"2026-08-11"},
  {"id":"famila-nordost","organization":"famila Nordost","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://www.famila-nordost.de/karriere/","verifiedAt":"2026-08-11"},
  {"id":"konsum-dresden","organization":"KONSUM Dresden","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://www.konsum.de/karriere/","verifiedAt":"2026-08-11"},
  {"id":"metro-deutschland","organization":"METRO Deutschland","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://karriere.metro.de/","verifiedAt":"2026-08-11"},
  {"id":"transgourmet-deutschland","organization":"Transgourmet Deutschland","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://www.transgourmet.de/karriere","verifiedAt":"2026-08-11"},
  {"id":"obi","organization":"OBI","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://jobs.obi.de/","verifiedAt":"2026-08-11"},
  {"id":"hornbach","organization":"HORNBACH","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://jobs.hornbach.com/Germany/","verifiedAt":"2026-08-11"},
  {"id":"bauhaus","organization":"BAUHAUS","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://jobs.bauhaus.info/","verifiedAt":"2026-08-11"},
  {"id":"baywa","organization":"BayWa","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://www.baywa.com/jobs-karriere/auf-einen-blick","verifiedAt":"2026-08-11"},
  {"id":"wurth","organization":"Würth","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://www.wuerth.de/web/de/awkg/karriere/karriere.php","verifiedAt":"2026-08-11"},
  {"id":"action","organization":"Action","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://de.action.jobs/","verifiedAt":"2026-08-11"},
  {"id":"woolworth","organization":"Woolworth","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://woolworth.de/karriere/jobs-und-karriere","verifiedAt":"2026-08-11"},
  {"id":"tedi","organization":"TEDi","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://karriere.tedi.com/","verifiedAt":"2026-08-11"},
  {"id":"ernsting-s-family","organization":"Ernsting’s family","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://career.ernstings-family.com/de/en/","verifiedAt":"2026-08-11"},
  {"id":"c-and-a","organization":"C&A","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://www.c-and-a.com/de/de/corporate/company/karrierejobs","verifiedAt":"2026-08-11"},
  {"id":"h-and-m","organization":"H&M","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://career.hm.com/de-de/","verifiedAt":"2026-08-11"},
  {"id":"inditex","organization":"Inditex","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://www.inditexpeople.com/","verifiedAt":"2026-08-11"},
  {"id":"peek-and-cloppenburg-dusseldorf","organization":"Peek & Cloppenburg Düsseldorf","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://karriere.peek-cloppenburg.de/","verifiedAt":"2026-08-11"},
  {"id":"breuninger","organization":"Breuninger","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://www.e-breuninger.de/de/karriere/","verifiedAt":"2026-08-11"},
  {"id":"galeria","organization":"GALERIA","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://karriere.galeria.de/","verifiedAt":"2026-08-11"},
  {"id":"intersport","organization":"INTERSPORT","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://karriere.intersport.de/","verifiedAt":"2026-08-11"},
  {"id":"mediamarktsaturn","organization":"MediaMarktSaturn","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://careers.mediamarktsaturn.com/","verifiedAt":"2026-08-11"},
  {"id":"muller","organization":"Müller","country":"DE","sector":"drugstore","integrationKind":"official_search","officialUrl":"https://www.mueller.de/unternehmen/karriere/stellenangebote/","verifiedAt":"2026-08-11"},
  {"id":"apollo-optik","organization":"Apollo Optik","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://karriere.apollo.de/","verifiedAt":"2026-08-11"},
  {"id":"deichmann","organization":"Deichmann","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://www.deichmann-karriere.de/","verifiedAt":"2026-08-11"},
  {"id":"new-yorker","organization":"NEW YORKER","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://jobs.newyorker.de/","verifiedAt":"2026-08-11"},
  {"id":"hunkemoller","organization":"Hunkemöller","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://jobs.hunkemoller.de/de","verifiedAt":"2026-08-11"},
  {"id":"takko-fashion","organization":"Takko Fashion","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://jobs.takko.com/de-de","verifiedAt":"2026-08-11"},
  {"id":"primark","organization":"Primark","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://careers.primark.com/de/","verifiedAt":"2026-08-11"},
  {"id":"budni","organization":"BUDNI","country":"DE","sector":"drugstore","integrationKind":"official_search","officialUrl":"https://www.budni.de/ueber-uns/karriere","verifiedAt":"2026-08-11"},
  {"id":"docmorris","organization":"DocMorris","country":"DE","sector":"drugstore","integrationKind":"official_search","officialUrl":"https://jobs.docmorris.com/de/","verifiedAt":"2026-08-11"},
  {"id":"ups","organization":"UPS","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://www.jobs-ups.com/dach/de/","verifiedAt":"2026-08-11"},
  {"id":"fedex","organization":"FedEx","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://careers.fedex.com/","verifiedAt":"2026-08-11"},
  {"id":"dpd-deutschland","organization":"DPD Deutschland","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://www.dpd.com/de/de/karriere/","verifiedAt":"2026-08-11"},
  {"id":"dsv","organization":"DSV","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://www.dsv.com/de-de/karriere","verifiedAt":"2026-08-11"},
  {"id":"dachser","organization":"DACHSER","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://careers.dachser.com/","verifiedAt":"2026-08-11"},
  {"id":"kuhne-nagel","organization":"Kühne+Nagel","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://jobs.kuehne-nagel.com/global/en","verifiedAt":"2026-08-11"},
  {"id":"rhenus","organization":"Rhenus","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://www.rhenus.group/karriere/","verifiedAt":"2026-08-11"},
  {"id":"hellmann-worldwide-logistics","organization":"Hellmann Worldwide Logistics","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://careers.hellmann.com/en","verifiedAt":"2026-08-11"},
  {"id":"fiege","organization":"FIEGE","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://karriere.fiege.com/","verifiedAt":"2026-08-11"},
  {"id":"nagel-group","organization":"Nagel-Group","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://karriere.nagel-group.com/nagel-als-arbeitgeber/","verifiedAt":"2026-08-11"},
  {"id":"arvato","organization":"Arvato","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://career.arvato.com/","verifiedAt":"2026-08-11"},
  {"id":"gxo-logistics","organization":"GXO Logistics","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://jobs.gxo.com/","verifiedAt":"2026-08-11"},
  {"id":"picnic","organization":"Picnic","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://jobs.picnic.app/de/","verifiedAt":"2026-08-11"},
  {"id":"uber-eats-courier","organization":"Uber Eats Courier","country":"DE","sector":"food","integrationKind":"open_entry","officialUrl":"https://www.uber.com/de/de/deliver/","verifiedAt":"2026-08-11"},
  {"id":"bolt-food-courier","organization":"Bolt Food Courier","country":"DE","sector":"food","integrationKind":"open_entry","officialUrl":"https://bolt.eu/de-de/food/courier/","verifiedAt":"2026-08-11"},
  {"id":"sixt","organization":"SIXT","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://www.sixt.jobs/de","verifiedAt":"2026-08-11"},
  {"id":"deutsche-bahn","organization":"Deutsche Bahn","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://db.jobs/de-de","verifiedAt":"2026-08-11"},
  {"id":"bvg","organization":"BVG","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://www.bvg.de/de/karriere","verifiedAt":"2026-08-11"},
  {"id":"hamburger-hochbahn","organization":"Hamburger Hochbahn","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://www.hochbahn.de/de/karriere","verifiedAt":"2026-08-11"},
  {"id":"rheinbahn","organization":"Rheinbahn","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://www.rheinbahn.de/unternehmen/karriere","verifiedAt":"2026-08-11"},
  {"id":"kolner-verkehrs-betriebe","organization":"Kölner Verkehrs-Betriebe","country":"DE","sector":"logistics","integrationKind":"official_search","officialUrl":"https://www.kvb.koeln/unternehmen/karriere/","verifiedAt":"2026-08-11"},
  {"id":"pizza-hut-deutschland","organization":"Pizza Hut Deutschland","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://pizzahut.de/karriere","verifiedAt":"2026-08-11"},
  {"id":"l-osteria","organization":"L’Osteria","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://losteria.net/de/karriere/","verifiedAt":"2026-08-11"},
  {"id":"peter-pane","organization":"Peter Pane","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://jobs.peterpane.de/","verifiedAt":"2026-08-11"},
  {"id":"dean-and-david","organization":"dean&david","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://deananddavid.com/karriere/","verifiedAt":"2026-08-11"},
  {"id":"backwerk","organization":"BackWerk","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://back-werk.career.softgarden.de/","verifiedAt":"2026-08-11"},
  {"id":"kamps","organization":"Kamps","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://kamps.de/karriere","verifiedAt":"2026-08-11"},
  {"id":"junge-die-backerei","organization":"Junge Die Bäckerei","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://www.jb.de/jobs/","verifiedAt":"2026-08-11"},
  {"id":"aramark-deutschland","organization":"Aramark Deutschland","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://aramarkcareers.com/Central-Europe/content/Germany-Careers-de_DE/?locale=de_DE","verifiedAt":"2026-08-11"},
  {"id":"compass-group-deutschland","organization":"Compass Group Deutschland","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://karriere.compass-group.de/","verifiedAt":"2026-08-11"},
  {"id":"ssp-deutschland","organization":"SSP Deutschland","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://careers.foodtravelexperts.com/","verifiedAt":"2026-08-11"},
  {"id":"casualfood","organization":"casualfood","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://www.casualfood.de/karriere/","verifiedAt":"2026-08-11"},
  {"id":"hyatt","organization":"Hyatt","country":"DE","sector":"hotel","integrationKind":"official_search","officialUrl":"https://careers.hyatt.com/","verifiedAt":"2026-08-11"},
  {"id":"dorint","organization":"Dorint","country":"DE","sector":"hotel","integrationKind":"official_search","officialUrl":"https://karriere.dorint.com/","verifiedAt":"2026-08-11"},
  {"id":"best-western-hotels","organization":"Best Western Hotels","country":"DE","sector":"hotel","integrationKind":"official_search","officialUrl":"https://www.bestwestern.de/karriere","verifiedAt":"2026-08-11"},
  {"id":"a-and-o-hostels","organization":"a&o Hostels","country":"DE","sector":"hotel","integrationKind":"official_search","officialUrl":"https://www.aohostels.com/de/karriere/ao-jobboerse/","verifiedAt":"2026-08-11"},
  {"id":"meininger-hotels","organization":"MEININGER Hotels","country":"DE","sector":"hotel","integrationKind":"official_search","officialUrl":"https://www.meininger-hotels.com/de/karriere/","verifiedAt":"2026-08-11"},
  {"id":"scandic-hotels","organization":"Scandic Hotels","country":"DE","sector":"hotel","integrationKind":"official_search","officialUrl":"https://www.scandichotelsgroup.com/career/","verifiedAt":"2026-08-11"},
  {"id":"melia-hotels","organization":"Meliá Hotels","country":"DE","sector":"hotel","integrationKind":"official_search","officialUrl":"https://careers.melia.com/","verifiedAt":"2026-08-11"},
  {"id":"jufa-hotels","organization":"JUFA Hotels","country":"DE","sector":"hotel","integrationKind":"official_search","officialUrl":"https://www.jufahotels.com/jobs/","verifiedAt":"2026-08-11"},
  {"id":"asklepios","organization":"Asklepios","country":"DE","sector":"healthcare","integrationKind":"official_search","officialUrl":"https://www.asklepios.com/karriere","verifiedAt":"2026-08-11"},
  {"id":"sana-kliniken","organization":"Sana Kliniken","country":"DE","sector":"healthcare","integrationKind":"official_search","officialUrl":"https://www.sana.de/karriere","verifiedAt":"2026-08-11"},
  {"id":"korian-deutschland","organization":"Korian Deutschland","country":"DE","sector":"healthcare","integrationKind":"official_search","officialUrl":"https://karriere.korian.de/startseite?lang=de-DE","verifiedAt":"2026-08-11"},
  {"id":"alloheim","organization":"Alloheim","country":"DE","sector":"healthcare","integrationKind":"official_search","officialUrl":"https://www.alloheim.de/karriere","verifiedAt":"2026-08-11"},
  {"id":"victors-group","organization":"Victors Group","country":"DE","sector":"healthcare","integrationKind":"official_search","officialUrl":"https://www.victors.de/karriere","verifiedAt":"2026-08-11"},
  {"id":"dussmann","organization":"Dussmann","country":"DE","sector":"facilities","integrationKind":"official_search","officialUrl":"https://karriere.dussmanngroup.com/","verifiedAt":"2026-08-11"},
  {"id":"wisag","organization":"WISAG","country":"DE","sector":"facilities","integrationKind":"official_search","officialUrl":"https://www.wisag.de/karriere/","verifiedAt":"2026-08-11"},
  {"id":"piepenbrock","organization":"Piepenbrock","country":"DE","sector":"facilities","integrationKind":"official_search","officialUrl":"https://jobs.piepenbrock.de/","verifiedAt":"2026-08-11"},
  {"id":"apleona","organization":"Apleona","country":"DE","sector":"facilities","integrationKind":"official_search","officialUrl":"https://jobs.apleona.com/","verifiedAt":"2026-08-11"},
  {"id":"randstad-deutschland","organization":"Randstad Deutschland","country":"DE","sector":"staffing","integrationKind":"official_search","officialUrl":"https://www.randstad.de/jobs/","verifiedAt":"2026-08-11"},
  {"id":"adecco-deutschland","organization":"Adecco Deutschland","country":"DE","sector":"staffing","integrationKind":"official_search","officialUrl":"https://jobs.de.adecco.com/","verifiedAt":"2026-08-11"},
  {"id":"manpower-deutschland","organization":"Manpower Deutschland","country":"DE","sector":"staffing","integrationKind":"official_search","officialUrl":"https://www.manpower.de/de/jobs","verifiedAt":"2026-08-11"},
  {"id":"persona-service","organization":"persona service","country":"DE","sector":"staffing","integrationKind":"official_search","officialUrl":"https://www.persona.de/jobs","verifiedAt":"2026-08-11"},
  {"id":"tempton","organization":"Tempton","country":"DE","sector":"staffing","integrationKind":"official_search","officialUrl":"https://www.tempton.de/jobs","verifiedAt":"2026-08-11"},
  {"id":"orizon","organization":"Orizon","country":"DE","sector":"staffing","integrationKind":"official_search","officialUrl":"https://www.orizon.de/de/jobboerse","verifiedAt":"2026-08-11"},
  {"id":"i-k-hofmann","organization":"I. K. Hofmann","country":"DE","sector":"staffing","integrationKind":"official_search","officialUrl":"https://www.hofmann.info/jobs","verifiedAt":"2026-08-11"},
  {"id":"alnatura","organization":"Alnatura","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://www.alnatura.de/de-de/ueber-uns/mitarbeit/","verifiedAt":"2026-08-11"},
  {"id":"bio-company","organization":"BIO COMPANY","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://jobs.biocompany.de/stellenmarkt/","verifiedAt":"2026-08-11"},
  {"id":"dehner","organization":"Dehner","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://www.dehner.de/jobs/jobmarkt","verifiedAt":"2026-08-11"},
  {"id":"fielmann","organization":"Fielmann","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://www.fielmann-group.com/","verifiedAt":"2026-08-11"},
  {"id":"hit-handelsgruppe","organization":"HIT Handelsgruppe","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://karriere.hit.de/","verifiedAt":"2026-08-11"},
  {"id":"famila-nordwest","organization":"famila Nordwest","country":"DE","sector":"grocery","integrationKind":"official_search","officialUrl":"https://karriere.famila-nordwest.de/","verifiedAt":"2026-08-11"},
  {"id":"decathlon","organization":"Decathlon","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://decathlon-karriere.de/","verifiedAt":"2026-08-11"},
  {"id":"fressnapf","organization":"Fressnapf","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://job.fressnapf.com/prj/shw/","verifiedAt":"2026-08-11"},
  {"id":"jysk","organization":"JYSK","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://jobs.jysk.de/","verifiedAt":"2026-08-11"},
  {"id":"porta","organization":"porta","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://karriere.porta.de/_/joblist","verifiedAt":"2026-08-11"},
  {"id":"thalia","organization":"Thalia","country":"DE","sector":"retail","integrationKind":"official_search","officialUrl":"https://jobs.thalia.de/","verifiedAt":"2026-08-11"},
  {"id":"kfc-deutschland","organization":"KFC Deutschland","country":"DE","sector":"food","integrationKind":"official_search","officialUrl":"https://www.kfc.de/karriere","verifiedAt":"2026-08-11"},
] satisfies OfficialRoute[]

const WORKPLACES: Partial<Record<OfficialRouteSector, WorkplaceType[]>> = {
  grocery: ['supermarket'], retail: ['retail_store'], drugstore: ['drugstore'],
  logistics: ['warehouse', 'parcel_hub'], food: ['restaurant', 'cafe'], hotel: ['hotel'],
}

/** Build one honest route card only when a route directory/fallback asks for it. */
export function officialRouteOpportunity(route: OfficialRoute, city?: string): NormalizedJob {
  const makeRoute = route.integrationKind === 'open_entry' ? makeOpenEntry : makeOfficialSearch
  return makeRoute({
    source_id: `official-route:${route.id}`,
    connectorId: `official-route:${route.id}`,
    employerFamily: route.organization,
    title: route.integrationKind === 'open_entry'
      ? `${route.organization} — open application`
      : `${route.organization} — official job search`,
    company: route.organization,
    canonicalEmployer: route.organization,
    location: { city, country: 'Germany', remote: false },
    description: '',
    url: route.officialUrl,
    lastVerifiedAt: route.verifiedAt,
    programName: route.organization,
    cityAvailability: city ? [city] : [],
    language: 'de',
    workplaces: WORKPLACES[route.sector],
    fieldProvenance: {
      title: { method: 'visible_text', source: route.officialUrl, observedAt: route.verifiedAt },
      employer: { method: 'visible_text', source: route.officialUrl, observedAt: route.verifiedAt },
    },
  })
}
