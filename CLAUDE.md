# Waggly — project rules

Waggly is a dog-walking app for walking "together" with friends, even far apart.
Owner: Amanda. Beta testers: Amanda (dog: Ellie) and Tonya (dog: Goose, Bernese Mountain Dog), both in Atlanta about an hour apart, both on iPhone.
Next testers: Bianca (Austin, TX, two dachshunds) and Stef (San Diego, two basset hounds).

## Build rules (must follow)

1. **Google Maps: free features only.** Never turn on or call a paid Google Maps Platform feature: Places / place search, Directions / Routes, Geocoding, Street View, or web Maps JavaScript. Opening the free Google Maps or Apple Maps app through a plain link (Maps URLs) is allowed. If a feature would need a paid Google service, stop and ask Amanda first.
2. The in-app map uses MapLibre + OpenFreeMap tiles (free, no account). Keep the OpenStreetMap attribution visible.
3. Walk routes come from the phone's GPS. Partner and perk locations are stored by Waggly, never looked up from a paid service.
4. Only friends can see each other's walks and routes (enforced by the database rules in `supabase/setup.sql`).

## Design

Sorbet palette: peach #FFAE96 (actions), butter #FFE49A (celebrations), pistachio #CBE6BE, baby blue #BCDDF4, lavender #DCCDF4, berry #94456A (headlines, routes, selected tab), cream #FFF7F2 (background), ink #2D2433 (text).
Fonts: Bagel Fat One (headlines), Nunito (everything else).
Bottom nav: Home, Walks, big paw (start walk), Friends, Packs. Profile opens from the dog photo on Home.

## Tech

Plain HTML/CSS/JS, no build step, hosted on GitHub Pages. Data in Supabase (`config.js` holds the project URL and public key). `?demo=1` runs a pretend world stored on the phone.
