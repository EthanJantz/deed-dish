# Deed Dish
Deed Dish is a web tool for exploring Chicago properties and their legal histories. It was inspired by Soren Spicknall's [Where Does Decay Come From](https://syllabusproject.org/where-does-decay-come-from/), the [FindMyLandlord](https://findmylandlord.chicagodsa.org/) project, and the [Landlord Mapper](https://landlordmapper.org/) project. 
## Usage
The Deed Dish application is hosted on [GitHub pages](https://ethanjantz.github.io/deed-dish/). Clicking on a property displays the property's Property Identification Number (PIN), associated address (or addresses), and a list of deeds associated with the property in reverse chronological order. If a grantee on a property's deed has been associated with a deed on at least 5 other properties in the available data their name will be an orange, clickable link. Clicking that link will highlight the properties that grantee's name appears on in orange. 
## The Data
Deed Dish is powered by data pulled from the [Cook County Clerk's Recordings Database](https://crs.cookcountyclerkil.gov/Search). The Clerk's database hosts legal documents and associated metadata for real estate in Cook County. Legal documents include mortgage assignments and releases, deeds, liens, and foreclosures, to name a few. This project focuses on presenting deeds, which are the clearest way to identify a chain of ownership for a given parcel. Parcels are identified uniquely by their Property Identification Number (PIN).
### Deeds
Deeds are legal documents that confer a title for a property from one entity to another. Each deed has an associated **document number**, a **document type**, **date of recording**, **list of grantor(s) and grantee(s)**, and a link to the **document PDF**. Most deeds also include a **consideration amount** and **associated address**. 

This project refers to specific property owners (grantees and grantors) as **entities**. The entity receiving ownership of the property is labelled on a deed as a **grantee**. There can be multiple entities associated with a specific document.
#### How Deed Dish Stores Deeds
Deed information is collected and stored on a DuckDB database with the following tables. 

| Table Name | Table Description                                                         | Columns |
| ---------- | ------------------------------------------------------------------------- | ------- |
| documents  | Contains the metadata for all documents pulled from the Clerk's records.  |         |
| entities   | Entity-level records identifying unique entity-pin-document combinations. |         |

After ingestion, the data is processed and used to generate two types of files: PIN-level files containing the history of all deeds found associated with the property, and entity-level files containing the list of PINs associated with the named entity[^1]. 
#### Coverage
Currently, Deed Dish covers all deeds available from the Cook County Recorder of Deeds for all parcels in the Chicago Community Areas of Logan Square, Avondale, Humboldt Park, and West Town based on the [Chicago CCA Boundary File](https://data.cityofchicago.org/Facilities-Geographic-Boundaries/Boundaries-Community-Areas-Map/cauq-8yn6). Records are available from 1985 to present. Data reflects the state of the documents as of August 2025. 
### Parcel Polygon Data
The polygon data powering the interactive map was pulled from [Cook Central](https://hub-cookcountyil.opendata.arcgis.com/datasets/5c2e70b7f31349dc83924a98df8fdbbb_2024/explore), the Cook County open data portal. The parcel data was then converted to a vector tilemap format using [tippecanoe](https://github.com/felt/tippecanoe). 
## Limitations
Not all properties have documents recorded or available. Approximately 10% (~46k of 51k parcels) were not pulled due to a lack of availability or gaps in the scraping methods. Analysis of the missing document data has identified condominium and street parcels as those most likely to be missing from the data.  

A deed is the most reliable document for identifying an owner of a property, but if that owner is an LLC there is no way of tracking whether the LLC ownership has changed hands with the available data. 

Grantee names are left as-is according to the Recorder of Deeds Website at the time of access. There are a large number of typos and other naming discrepancies in the data that may cause every property that _should_ be linked in the data to be linked. For example, it is likely that "2040 N AVE LLC" and "2040 NORTH AVE LLC" are the same business entity and that properties with either of those values as grantees are likely within the same ownership network. This is not a relationship that is reflected in the data at this time and instead we are matching on exact string matches for most entities.
## License
Deed Dish uses the [GNU Affero General Public License](https://www.gnu.org/licenses/agpl-3.0.txt). Input data is from the Cook County Recorder of Deeds and the Cook County Open Data Portal. The basemap on the homepage is from [OpenFreeMap](https://openfreemap.org/). 

## Installation
To install dependencies run

```bash
bun install
```

To run locally:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
