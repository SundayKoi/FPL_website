-- Link only the audited FPL S5 draft rows from /tmp/fpl-remote-public-data.sql.
-- Audit summary against Task 1 matcher:
--   exact: 58
--   alias: 1  (08 Mitsu Eclipse -> 08 Mitsu Eclipse#Chime)
--   ambiguous: 0
--   none: 1   (AcidStep)
--
-- This migration intentionally leaves unmatched/uncertain rows null.

with audited_links(player_id, canonical_player_id, player_display_name, confidence) as (
  values
    ('6be899a8-1f94-4f61-96a8-3f3bee79554d'::uuid, 'f82a82b6-b23a-47da-a103-309243219535'::uuid, '08 Mitsu Eclipse', 'alias'),
    ('b3b01f67-2054-4510-84d4-dbf9664d084c'::uuid, '54527423-1dda-4007-b9a4-dd2c7497c47e'::uuid, '7Gen', 'exact'),
    ('b9278959-0af2-4a5f-b24d-c1757ed86397'::uuid, '592a8d9a-855a-4431-8295-07d536d79c0e'::uuid, 'all gucci', 'exact'),
    ('a9eeef4d-175f-4097-a90f-67245dc6a036'::uuid, 'b9b4036e-33e8-419b-833b-1b50d2aec0f2'::uuid, 'Angrodis', 'exact'),
    ('cba2984c-71af-48b7-b642-ed088e96c8f1'::uuid, '4d815020-becb-4e35-9e8f-39a342c87878'::uuid, 'Aura', 'exact'),
    ('8a11f25f-35d5-40ac-aa3d-ec3b66ecadb8'::uuid, '433bdbf5-87c3-4b03-8071-7438a3f6141f'::uuid, 'Beg', 'exact'),
    ('61a93660-1856-40b2-ab99-e005c34e4fe1'::uuid, 'b8c36c46-6411-4ef6-8697-dba543271046'::uuid, 'Bleedinwolves', 'exact'),
    ('a76e3154-b23c-482b-a77c-b729725ff2d3'::uuid, '7ea5cb24-983f-4e99-82a8-b3060d7b5d10'::uuid, 'Boat chicken', 'exact'),
    ('829e38dc-54c9-4f4c-8801-af2e59d31771'::uuid, '059c1702-da7d-48d6-9b05-5671b81f0383'::uuid, 'Canny', 'exact'),
    ('6ee26801-556d-4717-8865-fa481e9bee36'::uuid, 'b0b76a8b-8715-43ea-bc76-c5aba3e1b2b5'::uuid, 'Cherrie', 'exact'),
    ('88c56f0a-b1a7-44b3-ba7a-9dd16df6554c'::uuid, '809c826c-ced7-4db0-bb7b-6a8c20f94b1e'::uuid, 'Chief', 'exact'),
    ('b2992c39-63ed-4de4-89cc-70e8200aa350'::uuid, 'fddd23dd-7bc2-455c-9013-9917289275d6'::uuid, 'Conguitos', 'exact'),
    ('48771153-8956-40dd-9d28-0147d7bc1b5b'::uuid, 'cfc85cbf-36d8-42be-be02-6d10dbfa5a23'::uuid, 'Crabadabadoo', 'exact'),
    ('5bda3151-fe82-4cec-9ff9-9702fd3104fe'::uuid, '4b1df9b4-a96d-4a20-819f-7d375f444493'::uuid, 'Dariss', 'exact'),
    ('62f9d692-9f1a-4790-8fa7-0c645df6fe6f'::uuid, 'efbfd331-be59-4157-ab7f-daf1646c080d'::uuid, 'DeathMasterPwnz2', 'exact'),
    ('7a038811-4266-4c1c-83f9-b21dafb76752'::uuid, '854bb934-c9e4-4ee6-9941-830039697072'::uuid, 'Doug', 'exact'),
    ('44d72c60-35c2-4e2d-922a-3683d2227dfc'::uuid, '12a62c81-406a-4610-8069-964981a08d70'::uuid, 'FeralEevee', 'exact'),
    ('5eab5e2f-f82e-44d6-a93b-17295a92e0f5'::uuid, 'a4e64892-d6a6-4015-a88c-98c337025517'::uuid, 'Flying Squirtle', 'exact'),
    ('5dc23e6f-c1c0-413d-bf2f-c41d0b6497e4'::uuid, '4ba03019-7578-47f7-86e5-8f16487d023a'::uuid, 'GratxAce', 'exact'),
    ('1689d65c-f345-464f-9a42-19e0325ac3b8'::uuid, '0482164c-5a9b-400d-bae2-df86f81ee2c7'::uuid, 'Humble', 'exact'),
    ('0b45a90e-932d-4e0f-8a77-4fc9a28e6020'::uuid, '65169817-326d-4d87-bed3-5f03854e43e9'::uuid, 'I am atomic', 'exact'),
    ('3b0a80df-73fc-4abd-b643-cb5967774a81'::uuid, 'c8e3dcef-90e0-4f4a-9593-e89aa24f243e'::uuid, 'i fear nobody', 'exact'),
    ('67c33474-1c44-428b-b840-7c7f01e6d24a'::uuid, 'cb13b166-b9f8-4afa-8825-d0e515c33e17'::uuid, 'IEnders', 'exact'),
    ('265df89b-3bab-4edf-835b-4953243d3559'::uuid, '87d2a314-75d4-4ad2-8d1c-2f0c0c2e903c'::uuid, 'Imperialarcher', 'exact'),
    ('44c5852b-5873-46b2-97f3-18891337e178'::uuid, 'ad522c22-d95d-4fd1-aa34-acc0bc88709b'::uuid, 'JayDK', 'exact'),
    ('c72219ed-392d-4875-bd66-dbc887af6c8d'::uuid, '0940922a-4e74-49e1-a528-501a403cb3b3'::uuid, 'Killer Python', 'exact'),
    ('f441d113-1b45-4c43-9b2a-89c570ee574c'::uuid, 'c81cfc66-765c-46f3-9313-6ffcd72f674f'::uuid, 'KingOfSpades', 'exact'),
    ('763bb516-a2a7-4fa4-922e-fe15e6241da3'::uuid, '678f2d6a-8668-4958-aa3c-4b9fa4e34b22'::uuid, 'Lizzo Mukkbang', 'exact'),
    ('6adfdd22-3f9f-4f3e-8e7e-09c48a2141e7'::uuid, '4208a143-6fea-47ae-9791-9037b1f0bc0e'::uuid, 'Lolcavan', 'exact'),
    ('99908045-3726-41ee-bf6b-a82a5ac767c2'::uuid, '09fccdb9-8ef8-443e-9628-d40dd336cba5'::uuid, 'LotusB5', 'exact'),
    ('5ce33ab5-ba7a-499f-8542-07187b0c8887'::uuid, '0c5b5baa-5aad-4da4-81d9-443fdc1993a2'::uuid, 'Matrix', 'exact'),
    ('53357e3c-aa50-432f-9ebd-e332e408cad1'::uuid, '07ee58ea-0abb-4ffe-a7b5-651404cea517'::uuid, 'Metashift', 'exact'),
    ('d636948e-eb79-4373-b21d-3306ff3a9e37'::uuid, '7b60bd05-8189-4fc6-84a2-8689f40bba5e'::uuid, 'MMO', 'exact'),
    ('d9e2ba6e-e5fa-4267-9a51-870eae927227'::uuid, '8b4e8204-bca5-4934-9ab0-d3abe395abd1'::uuid, 'Nickle', 'exact'),
    ('ff788c09-ef21-40a0-b867-2b0a388c217e'::uuid, 'd156fb65-c767-42f2-aae2-f8a1bf779379'::uuid, 'Pinei nessa poha', 'exact'),
    ('fdf7e2f7-745f-4a37-a27c-376555806cd4'::uuid, 'e1bb93d8-bd47-4200-9ee2-32d1781b2867'::uuid, 'Pr1mus', 'exact'),
    ('1352931b-44fc-42f5-9a3d-de682199027a'::uuid, 'c075f501-5963-4441-ba43-b8c0db6a1e97'::uuid, 'Promech', 'exact'),
    ('3ccd2052-6189-4d85-ba0c-1db05ee875e5'::uuid, 'f4cf0795-967b-4c5f-9f1d-e3ed18532915'::uuid, 'Qball', 'exact'),
    ('a7cbd8dc-8b02-47f9-acaa-fa6aebef0b33'::uuid, '9dd6506b-db2b-4b7e-a3be-c5d58f758ba8'::uuid, 'Quetips', 'exact'),
    ('5fef18d7-8ca5-49ea-a389-15fed7c4fcd1'::uuid, '2d7ce594-f05a-45ce-886a-70c6d8c12372'::uuid, 'Rutledge', 'exact'),
    ('bec9e547-9b95-457d-a3f8-0f8d36e68324'::uuid, 'e04a79bd-326e-49e3-aeab-4dd3a400af4b'::uuid, 'SeeU', 'exact'),
    ('29c8e5cf-009c-4904-920a-84069035adb6'::uuid, '569bfe5e-a77d-46b1-8ba7-0d8ffbd4c76a'::uuid, 'Sir Joey', 'exact'),
    ('4f4488b7-3244-4a51-b878-6c2ae7c6b7f9'::uuid, 'd78638db-1867-4946-9656-598512a535cb'::uuid, 'solomon', 'exact'),
    ('64c37fcf-7a34-445a-9092-f3edb0e7411f'::uuid, '5cc11a12-5a3a-4472-bf11-0cf2266db017'::uuid, 'Spies', 'exact'),
    ('ff900dc3-7080-43ed-b61d-97e952be0eca'::uuid, '97d55ba8-e0cd-42e4-8e8c-dfd068633313'::uuid, 'Superbeans', 'exact'),
    ('19193b9c-15d1-4b99-a6b2-806cce87a5c7'::uuid, '3be7b6ec-ea8c-4e8a-8003-c97c3dd1524b'::uuid, 'Sycoghost', 'exact'),
    ('305bbc92-4972-4631-bfd9-e712de7d937f'::uuid, '922b31f2-7387-42cf-8f57-12dab973ccc0'::uuid, 'the grip reaper', 'exact'),
    ('173eb23d-dcc2-41c2-9c12-65013c4d9efd'::uuid, 'b53744c7-fb51-4491-9dff-2bbc356b6f44'::uuid, 'TheMooseRules', 'exact'),
    ('84e47942-e09a-403a-a475-1acb9992ca10'::uuid, 'd70e3faf-23c0-4323-a721-e0427a2abfa7'::uuid, 'Thunder Master', 'exact'),
    ('ef83f531-e36f-4a3c-939d-b6b3e04b7344'::uuid, '1de69642-a175-41c0-b8d2-65237fb199a2'::uuid, 'UnluckyCanadian', 'exact'),
    ('9b255181-774e-4d69-be91-1f3a2cb3049e'::uuid, '24274e72-ebc8-432b-9a71-2aef933bf77b'::uuid, 'VIP Peekaboo', 'exact'),
    ('82306c26-3dc6-46d8-a22d-778159679892'::uuid, '83e5fd1e-63f4-4a18-862b-70f4eb05c0ff'::uuid, 'Walt', 'exact'),
    ('0837d707-1a65-41a6-8b3b-637bce0dc71b'::uuid, '7a175539-3ba8-48a9-8ba9-d5ca85953bd2'::uuid, 'Wellshowthemall', 'exact'),
    ('80bf4b7c-107a-4fea-8227-6263f4db24df'::uuid, '9eca3260-58a1-41a7-968a-5f6e9aae4dc1'::uuid, 'Winter', 'exact'),
    ('dbe6c42c-e0a3-4563-858a-c01d9b6a4872'::uuid, 'dcc21d93-3383-49a9-9452-7ef1f5d64519'::uuid, 'WrathOfSath', 'exact'),
    ('79089b32-167d-44f9-b1ae-675b933329fd'::uuid, 'af89f841-0dc2-40b2-83b4-28a0c3e4686d'::uuid, 'YRW', 'exact'),
    ('7961d20a-bd78-408a-93fa-e868a83480ac'::uuid, '28b73afa-f9d0-4e2b-8f6e-e1b0c4efa296'::uuid, 'YWGI', 'exact'),
    ('dda010b0-fce1-4d0d-8d04-443f1516de8a'::uuid, 'd5b9f018-cc4c-4abd-81fa-6014807c0bea'::uuid, 'Zoodiac', 'exact'),
    ('9adf0f2a-9756-4147-a544-4236f2e11868'::uuid, '586769a0-f8a4-422b-85e7-2c4d1947bce3'::uuid, 'ΣΠΑΡΤΙΑΤΗΣ', 'exact')
)
update public.players as players
set canonical_player_id = audited_links.canonical_player_id
from audited_links
where players.id = audited_links.player_id
  and players.draft_id = '7645b3e2-5cb3-4f28-8442-a36c9367f6f6'::uuid
  and players.canonical_player_id is distinct from audited_links.canonical_player_id;
