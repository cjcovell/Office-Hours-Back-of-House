-- =============================================================================
-- Office Hours: Back of House — seed data
-- =============================================================================
-- These contributors are PLACEHOLDERS so the UI feels populated.
-- Replace before going live.
-- =============================================================================

-- Reset (idempotent reseed). Order matters because of FKs.
truncate table
  public.kit_entries,
  public.admin_notifications,
  public.gear_items,
  public.contributors
restart identity cascade;

-- ---------- Contributors ----------------------------------------------------
insert into public.contributors (id, name, slug, bio, headshot_url, social_links, show_role, role_types, display_order) values
  ('11111111-1111-1111-1111-000000000001',
   'Jordan Park', 'jordan-park',
   'Host and creative director. Spends most days behind a Sony FX3 with too many lavs taped to too many things.',
   null,
   '{"twitter":"https://twitter.com/example","website":"https://example.com"}'::jsonb,
   'Host', '{on_air}', 10),

  ('11111111-1111-1111-1111-000000000002',
   'Sam Rivera', 'sam-rivera',
   'Audio engineer for the show. Has strong opinions about preamps, weak opinions about cables.',
   null,
   '{"mastodon":"https://mastodon.social/@example"}'::jsonb,
   'Audio Engineer', '{crew}', 20),

  ('11111111-1111-1111-1111-000000000003',
   'Riley Chen', 'riley-chen',
   'Technical director. Lives in the multiviewer. Builds rack gear like other people build LEGO.',
   null,
   '{"website":"https://example.com"}'::jsonb,
   'Technical Director', '{crew}', 30),

  ('11111111-1111-1111-1111-000000000004',
   'Avery Nakamura', 'avery-nakamura',
   'Panelist and back-of-house contributor. Hosts segments on production workflow and runs her own intercom rig.',
   null,
   '{"twitter":"https://twitter.com/example"}'::jsonb,
   'Panelist & Workflow Producer', '{on_air,crew}', 40),

  ('11111111-1111-1111-1111-000000000005',
   'Marcus Bell', 'marcus-bell',
   'Lighting designer. Believes the right key light fixes 80%% of camera problems.',
   null,
   '{}'::jsonb,
   'Lighting Designer', '{crew}', 50),

  ('11111111-1111-1111-1111-000000000006',
   'Devon Alvarez', 'devon-alvarez',
   'Co-host. Runs a compact panelist kit from a converted closet studio in Brooklyn.',
   null,
   '{"instagram":"https://instagram.com/example"}'::jsonb,
   'Co-Host', '{on_air}', 60);

-- ---------- Gear catalog ----------------------------------------------------
-- Categories used: camera, lens, microphone, audio interface, headphones,
-- light, switcher, multiviewer, computer, monitor, intercom, router,
-- rack gear, accessory.
-- ASINs included = active. ASIN null = pending (admin needs to fill in).

insert into public.gear_items (id, name, brand, model, category, description, asin, status) values
  -- Cameras
  ('22222222-2222-2222-2222-000000000001',
   'FX3 Full-Frame Cinema Camera', 'Sony', 'ILME-FX3', 'camera',
   'Compact full-frame cinema camera. Workhorse for streaming with clean HDMI and S-Log3.',
   'B09CL31C2D', 'active'),

  ('22222222-2222-2222-2222-000000000002',
   'a7S III Mirrorless Camera', 'Sony', 'ILCE-7SM3', 'camera',
   'Low-light champion. Popular for talking-head streams and panel feeds.',
   'B08F33D5MD', 'active'),

  ('22222222-2222-2222-2222-000000000003',
   'BMPCC 6K Pro', 'Blackmagic Design', 'Pocket Cinema 6K Pro', 'camera',
   'Built-in ND, BRAW recording. Loved by the rack-room crew.',
   'B098B9FBP4', 'active'),

  -- Lenses
  ('22222222-2222-2222-2222-000000000010',
   '24-70mm f/2.8 GM II', 'Sony', 'SEL2470GM2', 'lens',
   'Versatile zoom. The default panel-cam lens.',
   'B0B6PMVPCJ', 'active'),

  -- Microphones
  ('22222222-2222-2222-2222-000000000020',
   'SM7B Dynamic Microphone', 'Shure', 'SM7B', 'microphone',
   'Broadcast standard dynamic. Forgiving in untreated rooms.',
   'B0002E4Z8M', 'active'),

  ('22222222-2222-2222-2222-000000000021',
   'MV7+ Hybrid Microphone', 'Shure', 'MV7+', 'microphone',
   'USB/XLR hybrid. Great fallback when the interface is busy.',
   'B0CL5RVTBN', 'active'),

  ('22222222-2222-2222-2222-000000000022',
   'DPA 4060 Lavalier', 'DPA', '4060', 'microphone',
   'Tiny omni lav. Vanishes on camera, sounds enormous.',
   'B07BVWG6QC', 'active'),

  ('22222222-2222-2222-2222-000000000023',
   'KM 184 Small-Diaphragm Condenser', 'Neumann', 'KM 184', 'microphone',
   'Pencil condenser used for room/ambience pickup.',
   null, 'pending'),

  -- Audio interfaces / processors
  ('22222222-2222-2222-2222-000000000030',
   'RodeCaster Pro II', 'RØDE', 'RodeCaster Pro II', 'audio interface',
   'Four-channel broadcast console with built-in processing.',
   'B0B5LR2GHX', 'active'),

  ('22222222-2222-2222-2222-000000000031',
   'Apollo x4 Heritage', 'Universal Audio', 'Apollo x4', 'audio interface',
   'Thunderbolt interface with onboard UAD plug-ins.',
   'B0BNJX84WV', 'active'),

  -- Headphones
  ('22222222-2222-2222-2222-000000000040',
   'DT 770 PRO 80 Ohm', 'beyerdynamic', 'DT 770 PRO', 'headphones',
   'Closed-back monitoring standard.',
   'B0006NL5SM', 'active'),

  -- Lights
  ('22222222-2222-2222-2222-000000000050',
   'Forza 60C', 'Nanlite', 'Forza 60C', 'light',
   'Compact RGBLAC point-source. Used for key or accent.',
   'B0B5VHWXR2', 'active'),

  ('22222222-2222-2222-2222-000000000051',
   'Aputure Amaran 200d', 'Aputure', 'Amaran 200d', 'light',
   'Bright daylight COB. Pairs with a softbox for key light.',
   'B09BJZ3Z51', 'active'),

  ('22222222-2222-2222-2222-000000000052',
   'PavoTube II 6C', 'Nanlite', 'PavoTube II 6C', 'light',
   'Battery-powered RGB tube. Hidden as a hair light or background accent.',
   null, 'pending'),

  -- Switchers / multiviewers
  ('22222222-2222-2222-2222-000000000060',
   'ATEM Mini Extreme ISO', 'Blackmagic Design', 'ATEM Mini Extreme ISO', 'switcher',
   'Eight-input HDMI switcher with ISO recording. The home-studio standard.',
   'B08TVMD27W', 'active'),

  ('22222222-2222-2222-2222-000000000061',
   'SmartView 4K', 'Blackmagic Design', 'SmartView 4K', 'multiviewer',
   '15.6" 4K rack monitor used as a confidence/multiview display.',
   null, 'pending'),

  -- Computers / monitors
  ('22222222-2222-2222-2222-000000000070',
   'Mac Studio (M2 Ultra)', 'Apple', 'Mac Studio M2 Ultra', 'computer',
   'Production workstation. Drives the multiviewer and runs OBS / Companion.',
   'B0C7BZ8WQR', 'active'),

  ('22222222-2222-2222-2222-000000000071',
   'Studio Display', 'Apple', 'Studio Display', 'monitor',
   '27" 5K reference display.',
   'B09V3J6V8K', 'active'),

  -- Intercom
  ('22222222-2222-2222-2222-000000000080',
   'FreeSpeak II Beltpack', 'Clear-Com', 'FSII-BP19', 'intercom',
   'Wireless beltpack used by the floor crew.',
   null, 'pending'),

  ('22222222-2222-2222-2222-000000000081',
   'Bolero Standalone', 'Riedel', 'Bolero S', 'intercom',
   'DECT intercom for the back-of-house team.',
   null, 'pending'),

  -- Networking / router
  ('22222222-2222-2222-2222-000000000090',
   'UDM Pro', 'Ubiquiti', 'UniFi Dream Machine Pro', 'router',
   'Routes the studio LAN. Keeps the SRT feeds from stepping on each other.',
   'B08PYK4GP6', 'active'),

  -- Rack gear
  ('22222222-2222-2222-2222-000000000100',
   'NetGear AV Line M4250-26G4XF-PoE+', 'NETGEAR', 'M4250-26G4XF', 'rack gear',
   'AV-tuned managed switch. Carries Dante and NDI traffic in the rack.',
   'B09NKM4G8K', 'active'),

  ('22222222-2222-2222-2222-000000000101',
   'Decimator MD-LX', 'Decimator', 'MD-LX', 'rack gear',
   'Bidirectional SDI/HDMI converter. The duct tape of the rack.',
   'B019R4SR7K', 'active'),

  -- Accessories
  ('22222222-2222-2222-2222-000000000110',
   'Stream Deck XL', 'Elgato', 'Stream Deck XL', 'accessory',
   '32-key control surface. Drives Companion macros for the switcher and lights.',
   'B07RL8H55Z', 'active');

-- ---------- Kit entries -----------------------------------------------------
-- Jordan Park (Host, on-air) — full panelist kit
insert into public.kit_entries (contributor_id, gear_item_id, notes, display_order) values
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000001', 'Main camera. S-Log3 baked into a custom LUT.', 10),
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000010', 'Lives at 35mm for talking-head framing.', 20),
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000020', 'On a Yellowtec mic arm just out of frame.', 30),
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000040', 'Cans for IFB.', 40),
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000051', 'Key light through a 2x2 softbox.', 50),
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000110', 'Macros for muting, scene switching, and the "be right back" card.', 60);

-- Sam Rivera (Audio Engineer, crew) — audio-heavy
insert into public.kit_entries (contributor_id, gear_item_id, notes, display_order) values
  ('11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000031', 'Tracking interface. Onboard 1176 on the host bus.', 10),
  ('11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000020', 'Default mic for any guest who hasn''t got their own.', 20),
  ('11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000022', 'Field lav for remote interviews.', 30),
  ('11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000040', 'Reference cans.', 40),
  ('11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000023', 'Room mic when we record live audience segments.', 50);

-- Riley Chen (TD, crew) — rack-heavy
insert into public.kit_entries (contributor_id, gear_item_id, notes, display_order) values
  ('11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000060', 'Primary switcher. ISO records every input for post.', 10),
  ('11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000061', 'Multiview at the engineer position.', 20),
  ('11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000070', 'Production workstation. Companion + OBS + record.', 30),
  ('11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000090', 'Studio router. SRT in/out lives behind this.', 40),
  ('11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000100', 'Dante + NDI on separate VLANs.', 50),
  ('11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000101', 'Two of these on the desk for ad-hoc conversion.', 60),
  ('11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000080', 'Floor intercom for camera ops.', 70);

-- Avery Nakamura (panelist + crew) — straddles both
insert into public.kit_entries (contributor_id, gear_item_id, notes, display_order) values
  ('11111111-1111-1111-1111-000000000004', '22222222-2222-2222-2222-000000000002', 'Panelist cam in the home office.', 10),
  ('11111111-1111-1111-1111-000000000004', '22222222-2222-2222-2222-000000000021', 'Hybrid mic — XLR at the desk, USB on the road.', 20),
  ('11111111-1111-1111-1111-000000000004', '22222222-2222-2222-2222-000000000050', 'Fill light, dialed warm.', 30),
  ('11111111-1111-1111-1111-000000000004', '22222222-2222-2222-2222-000000000081', 'Bolero pack for back-of-house segments.', 40),
  ('11111111-1111-1111-1111-000000000004', '22222222-2222-2222-2222-000000000110', 'Workflow macros for swapping between panel and BoH scenes.', 50);

-- Marcus Bell (Lighting, crew) — light-heavy
insert into public.kit_entries (contributor_id, gear_item_id, notes, display_order) values
  ('11111111-1111-1111-1111-000000000005', '22222222-2222-2222-2222-000000000051', 'Daylight key.', 10),
  ('11111111-1111-1111-1111-000000000005', '22222222-2222-2222-2222-000000000050', 'Color accent on the back wall.', 20),
  ('11111111-1111-1111-1111-000000000005', '22222222-2222-2222-2222-000000000052', 'Hidden pavotube as hair light.', 30),
  ('11111111-1111-1111-1111-000000000005', '22222222-2222-2222-2222-000000000003', 'BMPCC dedicated to the tally feed for lighting checks.', 40);

-- Devon Alvarez (Co-Host, on-air) — compact closet studio
insert into public.kit_entries (contributor_id, gear_item_id, notes, display_order) values
  ('11111111-1111-1111-1111-000000000006', '22222222-2222-2222-2222-000000000002', 'Mounted on a wall arm to save desk space.', 10),
  ('11111111-1111-1111-1111-000000000006', '22222222-2222-2222-2222-000000000020', 'Tucked under a foam panel.', 20),
  ('11111111-1111-1111-1111-000000000006', '22222222-2222-2222-2222-000000000030', 'RodeCaster handles mix + soundboard for live segments.', 30),
  ('11111111-1111-1111-1111-000000000006', '22222222-2222-2222-2222-000000000050', 'Tiny key light, runs on USB-C PD.', 40),
  ('11111111-1111-1111-1111-000000000006', '22222222-2222-2222-2222-000000000071', '5K monitor for the prompter overlay.', 50);
