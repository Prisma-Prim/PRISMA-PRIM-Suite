-- One frozen PDF per designated Version; metadata never transfers stored bytes to Node.
CREATE FUNCTION documents_frozen_pdf(version_row document_versions,pdf_row document_pdfs,maximum_bytes integer DEFAULT 5242880,verify_bytes boolean DEFAULT true) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(
  (version_row).status IN ('official','superseded')
  AND ((pdf_row).workspace_id,(pdf_row).company_id,(pdf_row).document_id,(pdf_row).version_id)=((version_row).workspace_id,(version_row).company_id,(version_row).document_id,(version_row).id)
  AND (pdf_row).scan_outcome='clean' AND (pdf_row).media_type='application/pdf'
  AND (NOT verify_bytes OR ((pdf_row).size BETWEEN 1 AND maximum_bytes
    AND (pdf_row).size=octet_length((pdf_row).content)
    AND (pdf_row).sha256=encode(sha256((pdf_row).content),'hex')))
  AND NOT EXISTS(SELECT 1 FROM document_pdfs later_pdf WHERE (later_pdf.workspace_id,later_pdf.company_id,later_pdf.document_id,later_pdf.version_id)=((pdf_row).workspace_id,(pdf_row).company_id,(pdf_row).document_id,(pdf_row).version_id) AND later_pdf.upload_revision>(pdf_row).upload_revision),false);
$$;
--> statement-breakpoint
-- Existing Records retain their exact source when correcting transcription.
CREATE FUNCTION documents_invoice_record_source(w uuid,c uuid,source jsonb,frozen_use boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; cv_id uuid; source_client uuid;
BEGIN
 IF NOT invoice_source_valid(source) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_source',MESSAGE='An exact source tuple is required.'; END IF;
 SELECT client_id INTO source_client FROM working_documents WHERE workspace_id=w AND company_id=c AND id=(source->>'documentId')::uuid FOR UPDATE;
 PERFORM client_require_invoice_record_new_use(w,c,source_client);
 PERFORM 1 FROM document_versions WHERE workspace_id=w AND company_id=c AND document_id=(source->>'documentId')::uuid AND id=(source->>'documentVersionId')::uuid FOR SHARE;
 SELECT jsonb_build_object('source',source,'originalClientId',d.client_id,'opportunityId',r.opportunity_id,'contractId',r.contract_id,'contractVersionId',r.contract_version_id,'receivingPartyAdditionalId',r.recipient_additional_legal_entity_id,'byteLength',p.size,'sha256',p.sha256,'copiedContext',jsonb_build_object('companyLabel',co.display_name,'contractReference',r.illustrative_reference::text,'contractVersionNumber',r.contract_version_number,'receivingParty',jsonb_build_object('kind',r.recipient_kind,'legalName',r.recipient_legal_name,'taxIdentifier',r.recipient_tax_id,'address',r.recipient_legal_address))),cv.id INTO result,cv_id
 FROM working_documents d JOIN companies co ON (co.workspace_id,co.id)=(d.workspace_id,d.company_id) JOIN document_versions v ON (v.workspace_id,v.company_id,v.document_id)=(d.workspace_id,d.company_id,d.id) JOIN document_pdfs p ON (p.workspace_id,p.company_id,p.document_id,p.version_id)=(v.workspace_id,v.company_id,v.document_id,v.id) JOIN external_invoice_document_relations r ON (r.workspace_id,r.company_id,r.document_id)=(d.workspace_id,d.company_id,d.id) JOIN contracts ct ON (ct.workspace_id,ct.company_id,ct.id)=(r.workspace_id,r.company_id,r.contract_id) JOIN contract_versions cv ON (cv.workspace_id,cv.company_id,cv.contract_id,cv.id)=(r.workspace_id,r.company_id,r.contract_id,r.contract_version_id) JOIN contract_signing_declarations sd ON (sd.workspace_id,sd.company_id,sd.contract_id,sd.contract_version_id)=(cv.workspace_id,cv.company_id,cv.contract_id,cv.id) JOIN client_accounts cl ON (cl.workspace_id,cl.id)=(d.workspace_id,d.client_id) JOIN client_company_relationships cr ON (cr.workspace_id,cr.company_id,cr.client_account_id)=(d.workspace_id,d.company_id,d.client_id)
 WHERE d.workspace_id=w AND d.company_id=c AND d.id=(source->>'documentId')::uuid AND d.type='external-invoice' AND v.id=(source->>'documentVersionId')::uuid AND v.status IN ('official','superseded') AND p.id=(source->>'representationId')::uuid AND (NOT frozen_use OR documents_frozen_pdf(v,p)) AND p.scan_outcome='clean' AND p.size=octet_length(p.content) AND p.sha256=encode(sha256(p.content),'hex')
 AND cl.status='active' AND cr.status='active' AND ct.kind='CONTRACT' AND ct.origin='COMPANY_MODEL_OFFER' AND ct.opportunity_id=r.opportunity_id AND ct.original_client_account_id=d.client_id AND cv.provenance='COMPANY_MODEL_OFFER' AND cv.decision_state='APPROVED' AND cv.execution_state='EXECUTED' AND cv.recipient_client_account_id=d.client_id AND (cv.recipient_kind,cv.recipient_additional_legal_entity_id,cv.recipient_legal_name,cv.recipient_tax_id,cv.recipient_legal_address) IS NOT DISTINCT FROM (r.recipient_kind,r.recipient_additional_legal_entity_id,r.recipient_legal_name,r.recipient_tax_id,r.recipient_legal_address);
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_source',MESSAGE='The native source is not eligible for a new financial use.'; END IF;
 PERFORM validate_reported_contract_signing(cv_id);
 RETURN result;
END $$;
--> statement-breakpoint
-- Every native CREATE keeps the strict three-argument entry point.
CREATE OR REPLACE FUNCTION documents_invoice_record_source(w uuid,c uuid,source jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT documents_invoice_record_source(w,c,source,true);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION invoice_prepare_command() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE body jsonb:=NEW.intent->'body'; operation text:=body->>'action'; root invoice_records%ROWTYPE; predecessor invoice_records%ROWTYPE; stamp text; latest_id uuid;
BEGIN
 IF NEW.revision<>0 OR NEW.response<>'{}'::jsonb OR length(NEW.idempotency_key) NOT BETWEEN 1 AND 200 OR NEW.idempotency_key<>btrim(NEW.idempotency_key) OR NOT coalesce(invoice_keys(NEW.intent,ARRAY['format','workspaceId','companyId','actorMembershipId','recordId','body']) AND NEW.intent->>'format'='EXTERNAL_INVOICE_INTENT/1' AND NEW.intent->>'workspaceId'=NEW.workspace_id::text AND NEW.intent->>'companyId'=NEW.company_id::text AND NEW.intent->>'actorMembershipId'=NEW.actor_membership_id::text AND NEW.intent->>'recordId'=NEW.record_id::text,false) THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_intent',MESSAGE='Invoice commands require their exact native intent.';
 END IF;
 IF NOT coalesce(CASE operation WHEN 'CREATE' THEN invoice_keys(body,ARRAY['action','source','values','acknowledgeExternalDeclaration','replacesWithdrawnRecordId']) AND invoice_source_valid(body->'source') AND invoice_values_valid(body->'values') AND body->'acknowledgeExternalDeclaration'='true'::jsonb AND (body->'replacesWithdrawnRecordId'='null'::jsonb OR invoice_uuid(body->'replacesWithdrawnRecordId'))
 WHEN 'CORRECT' THEN invoice_keys(body,ARRAY['action','expectedRevision','values','reason']) AND invoice_number(body->'expectedRevision') AND invoice_values_valid(body->'values') AND invoice_text(body->'reason',2000)
 WHEN 'WITHDRAW_ENTRY' THEN invoice_keys(body,ARRAY['action','expectedRevision','reason']) AND invoice_number(body->'expectedRevision') AND invoice_text(body->'reason',2000) ELSE false END,false) OR (operation='WITHDRAW_ENTRY') IS DISTINCT FROM (NEW.source_captures IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_intent',MESSAGE='Invoice intent has an invalid action or closed format.';
 END IF;
 PERFORM access_require_invoice_record_command(NEW.workspace_id,NEW.company_id,NEW.actor_membership_id,NEW.actor_internal_user_id,NEW.assignment_id,NEW.source_captures);
 IF operation='CREATE' THEN
  PERFORM documents_invoice_record_source(NEW.workspace_id,NEW.company_id,body->'source');
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-source:'||NEW.workspace_id||':'||NEW.company_id||':'||(body->'source'->>'documentId'),0));
  IF EXISTS(SELECT 1 FROM invoice_records WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND document_id=(body->'source'->>'documentId')::uuid AND entry_state='RECORDED') THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_source_active',MESSAGE='This Document already has an active financial record.';
  END IF;
  SELECT id INTO latest_id FROM invoice_records WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND document_id=(body->'source'->>'documentId')::uuid ORDER BY created_sequence DESC LIMIT 1;
  IF latest_id IS NOT NULL AND latest_id IS DISTINCT FROM (body->>'replacesWithdrawnRecordId')::uuid THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_predecessor',MESSAGE='Reusing a source requires its latest withdrawn predecessor.';
  END IF;
  IF body->>'replacesWithdrawnRecordId' IS NOT NULL THEN
   SELECT * INTO predecessor FROM invoice_records WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=(body->>'replacesWithdrawnRecordId')::uuid FOR UPDATE;
   IF NOT FOUND OR predecessor.entry_state<>'WITHDRAWN' OR EXISTS(SELECT 1 FROM invoice_records WHERE replaces_withdrawn_record_id=predecessor.id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_predecessor',MESSAGE='A withdrawn entry may have exactly one explicit replacement.';
   END IF;
  END IF;
  NEW.revision:=1;
 ELSE
  -- Source commands and withdrawal share exact scoped record serialization.
  SELECT * INTO root FROM invoice_records WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.record_id FOR UPDATE;
  IF NOT FOUND OR root.entry_state<>'RECORDED' OR root.revision<>(body->>'expectedRevision')::integer OR root.revision=2147483647 THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_transition',MESSAGE='The financial entry is withdrawn, stale or exhausted.';
  END IF;
  IF operation='CORRECT' THEN
   PERFORM documents_invoice_record_source(NEW.workspace_id,NEW.company_id,root.source_snapshot->'source',false);
   IF root.values=body->'values' THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_no_change',MESSAGE='A correction requires a material transcription change.'; END IF;
  END IF;
  NEW.revision:=root.revision+1;
 END IF;
 NEW.created_at:=date_trunc('milliseconds',clock_timestamp());
 stamp:=to_char(NEW.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 NEW.response:=jsonb_build_object('format','EXTERNAL_INVOICE_COMMAND/1','commandId',NEW.id,'recordId',NEW.record_id,'revision',NEW.revision,'action',operation,'recordedAt',stamp);
 RETURN NEW;
END $$;

--> statement-breakpoint
-- Remaining exact-source consumers use the same frozen predicate.
CREATE OR REPLACE FUNCTION documents_payment_source(w uuid,c uuid,source jsonb,new_use boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; original_client uuid;
BEGIN
 IF NOT payment_source_valid(source) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source',MESSAGE='Select one exact Payment Evidence source.'; END IF;
 SELECT client_id INTO original_client FROM working_documents WHERE workspace_id=w AND company_id=c AND id=(source->>'documentId')::uuid AND type='payment-evidence';
 IF new_use THEN PERFORM client_require_payment_new_use(w,c,original_client);
 ELSE PERFORM client_require_payment_original_reference(w,c,original_client); END IF;
 PERFORM 1 FROM working_documents WHERE workspace_id=w AND company_id=c AND id=(source->>'documentId')::uuid FOR SHARE;
 PERFORM 1 FROM document_versions WHERE workspace_id=w AND company_id=c AND document_id=(source->>'documentId')::uuid AND id=(source->>'documentVersionId')::uuid FOR SHARE;
 SELECT jsonb_build_object('source',source,'originalClientId',d.client_id,'payerAdditionalId',s.payer_legal_entity_id,'byteLength',p.size,'sha256',p.sha256,'copiedContext',jsonb_build_object('companyLabel',s.receiving_company_label,'payer',jsonb_build_object('kind',s.payer_kind,'legalName',s.payer_legal_name,'taxId',s.payer_tax_id,'legalAddress',s.payer_legal_address))) INTO result
 FROM working_documents d JOIN payment_evidence_document_sources s ON (s.workspace_id,s.company_id,s.document_id)=(d.workspace_id,d.company_id,d.id)
 JOIN document_versions v ON (v.workspace_id,v.company_id,v.document_id)=(d.workspace_id,d.company_id,d.id)
 JOIN document_pdfs p ON (p.workspace_id,p.company_id,p.document_id,p.version_id)=(v.workspace_id,v.company_id,v.document_id,v.id)
 JOIN client_accounts cl ON (cl.workspace_id,cl.id)=(d.workspace_id,d.client_id)
 JOIN client_company_relationships cr ON (cr.workspace_id,cr.company_id,cr.client_account_id)=(d.workspace_id,d.company_id,d.client_id)
 WHERE d.workspace_id=w AND d.company_id=c AND d.id=(source->>'documentId')::uuid AND d.type='payment-evidence' AND d.confidentiality='company-confidential'
 AND s.original_client_account_id=d.client_id AND v.id=(source->>'documentVersionId')::uuid AND documents_frozen_pdf(v,p)
 AND p.id=(source->>'representationId')::uuid
 AND cl.status IN ('active','superseded') AND cr.status='active';
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source',MESSAGE='The selected exact source is unavailable or ineligible.'; END IF;
 RETURN result;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_reported_contract_signing(target_version_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; d contract_decisions%ROWTYPE; s contract_signing_declarations%ROWTYPE; q contract_quality_runs%ROWTYPE; p document_pdfs%ROWTYPE; dv document_versions%ROWTYPE; wd working_documents%ROWTYPE; warnings jsonb; expected_pdf jsonb; statement jsonb;
BEGIN
 SELECT * INTO v FROM contract_versions WHERE id=target_version_id;
 SELECT * INTO c FROM contracts WHERE id=v.contract_id AND workspace_id=v.workspace_id AND company_id=v.company_id;
 IF c.origin IS DISTINCT FROM 'COMPANY_MODEL_OFFER' THEN
  IF EXISTS(SELECT 1 FROM contract_signing_declarations wrong_mode WHERE wrong_mode.workspace_id=v.workspace_id AND wrong_mode.company_id=v.company_id AND wrong_mode.contract_id=v.contract_id AND wrong_mode.contract_version_id=v.id) THEN RAISE EXCEPTION 'Reported signing requires a Company-model Contract' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM contract_signatures legacy WHERE legacy.workspace_id=v.workspace_id AND legacy.company_id=v.company_id AND legacy.contract_id=v.contract_id AND legacy.contract_version_id=v.id) THEN RAISE EXCEPTION 'Simulated signature is not allowed for a Company-model Contract' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM contract_signing_declarations WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_id=v.contract_id AND contract_version_id=v.id;
 IF v.execution_state='NOT_EXECUTED' THEN
  IF s.id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected signing declaration' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 SELECT * INTO d FROM contract_decisions WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_id=v.contract_id AND contract_version_id=v.id AND kind='APPROVE';
 IF s.id IS NULL OR d.id IS NULL OR c.kind<>'CONTRACT' OR v.provenance<>'COMPANY_MODEL_OFFER' OR v.decision_state<>'APPROVED' OR v.superseded_by_version_id IS NOT NULL OR s.approval_decision_id<>d.id OR s.quality_run_id=d.quality_run_id OR s.result_revision<>v.created_contract_revision+2 OR c.revision<>s.result_revision+(SELECT count(*) FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id) OR s.representation_checksum<>d.representation_checksum OR s.representation_checksum IS DISTINCT FROM v.model_generation_snapshot->'representation'->>'sha256' OR s.recorded_at<d.decided_at THEN RAISE EXCEPTION 'Invalid reported signing approval/state' USING ERRCODE='23514'; END IF;
 SELECT * INTO q FROM contract_quality_runs WHERE workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND contract_version_id=s.contract_version_id AND id=s.quality_run_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND evaluated_at=s.recorded_at;
 SELECT coalesce(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb) INTO warnings FROM jsonb_array_elements(q.results) item WHERE item->>'status'='WARNING';
 statement:=s.statement;
 IF q.id IS NULL OR q.rule_set<>'CONTRACT_QUALITY_COMPANY_MODEL' OR q.rule_set_version<>1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(q.results) item WHERE item->>'status'='ERROR') OR
 (jsonb_typeof(statement)='object' AND statement ?& ARRAY['expectedContractRevision','documentId','documentVersionId','representationId','providerSignatory','clientSignatory','concordanceBasis','acceptanceBasis','acknowledgedWarningCodes'] AND (statement-ARRAY['expectedContractRevision','documentId','documentVersionId','representationId','providerSignatory','clientSignatory','concordanceBasis','acceptanceBasis','acknowledgedWarningCodes'])='{}'::jsonb AND statement->'expectedContractRevision'=to_jsonb(s.result_revision-1) AND statement->>'documentId'=s.document_id::text AND statement->>'documentVersionId'=s.document_version_id::text AND statement->>'representationId'=s.representation_id::text AND reported_signing_signatory(statement->'providerSignatory',s.recorded_at) AND reported_signing_signatory(statement->'clientSignatory',s.recorded_at) AND reported_signing_literal(statement->'concordanceBasis',2000) AND reported_signing_literal(statement->'acceptanceBasis',2000) AND jsonb_typeof(statement->'acknowledgedWarningCodes')='array') IS NOT TRUE THEN RAISE EXCEPTION 'Invalid reported signing statement/checks' USING ERRCODE='23514'; END IF;
 IF (SELECT coalesce(jsonb_agg(code ORDER BY code),'[]'::jsonb) FROM jsonb_array_elements_text(statement->'acknowledgedWarningCodes') code) IS DISTINCT FROM warnings THEN RAISE EXCEPTION 'Invalid complete signing warnings' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM document_pdfs WHERE workspace_id=s.workspace_id AND company_id=s.company_id AND document_id=s.document_id AND version_id=s.document_version_id AND id=s.representation_id;
 SELECT * INTO dv FROM document_versions WHERE workspace_id=s.workspace_id AND company_id=s.company_id AND document_id=s.document_id AND id=s.document_version_id;
 SELECT * INTO wd FROM working_documents WHERE workspace_id=s.workspace_id AND company_id=s.company_id AND id=s.document_id AND client_id=c.original_client_account_id AND type='received-contract';
 IF p.id IS NULL OR dv.id IS NULL OR wd.id IS NULL OR NOT documents_frozen_pdf(dv,p) OR dv.frozen_title IS NULL OR NOT EXISTS(SELECT 1 FROM received_contract_document_relations r WHERE r.workspace_id=s.workspace_id AND r.company_id=s.company_id AND r.document_id=s.document_id AND r.contract_id=s.contract_id AND r.contract_version_id=s.contract_version_id AND r.opportunity_id=c.opportunity_id AND r.contract_version_number=v.version_number) THEN RAISE EXCEPTION 'Invalid received signing PDF binding' USING ERRCODE='23514'; END IF;
 expected_pdf:=jsonb_build_object('documentId',p.document_id::text,'documentVersionId',p.version_id::text,'documentVersionNumber',dv.number,'title',dv.frozen_title,'status',s.pdf->>'status','representationId',p.id::text,'fileName',p.file_name,'mediaType',p.media_type,'size',p.size,'sha256',p.sha256,'scanOutcome',p.scan_outcome,'scanEngine',p.scan_engine,'scannedAt',to_char(p.scanned_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'storedByMembershipId',p.stored_by_membership_id::text,'storedAt',to_char(p.stored_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 IF s.pdf IS DISTINCT FROM expected_pdf OR s.pdf->>'status' NOT IN ('official','superseded') THEN RAISE EXCEPTION 'Invalid frozen signing PDF facts' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM contract_commands r WHERE r.workspace_id=s.workspace_id AND r.company_id=s.company_id AND r.result_contract_id=s.contract_id AND r.result_version_id=s.contract_version_id AND r.kind='DECLARE_SIGNING' AND r.opportunity_id=c.opportunity_id AND r.actor_workspace_membership_id=s.actor_workspace_membership_id AND r.created_at=s.recorded_at)
 OR NOT EXISTS(SELECT 1 FROM contract_events e WHERE e.workspace_id=s.workspace_id AND e.company_id=s.company_id AND e.contract_id=s.contract_id AND e.contract_version_id=s.contract_version_id AND e.action='contract_version.signing_declared' AND e.actor_workspace_membership_id=s.actor_workspace_membership_id AND e.actor_internal_user_id=s.actor_internal_user_id AND e.occurred_at=s.recorded_at AND e.metadata=jsonb_build_object('contractId',c.id::text,'contractVersionId',v.id::text,'versionNumber',v.version_number,'provenance','COMPANY_MODEL_OFFER','evidenceKind','DECLARED_RECEIVED_PDF')) THEN RAISE EXCEPTION 'Incomplete reported signing receipt/event' USING ERRCODE='23514'; END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_working_evidence_support() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h working_evidence_cases%ROWTYPE; d working_documents%ROWTYPE; v document_versions%ROWTYPE; p document_pdfs%ROWTYPE; actual jsonb;
BEGIN
 SELECT c.* INTO h FROM working_evidence_cases c JOIN working_evidence_revisions r ON r.workspace_id=c.workspace_id AND r.company_id=c.company_id AND r.case_id=c.id WHERE r.id=NEW.revision_id AND r.workspace_id=NEW.workspace_id AND r.company_id=NEW.company_id AND r.case_id=NEW.case_id;
 SELECT * INTO d FROM working_documents WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.document_id;
 SELECT * INTO v FROM document_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND document_id=NEW.document_id AND id=NEW.version_id;
 SELECT * INTO p FROM document_pdfs WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND document_id=NEW.document_id AND version_id=NEW.version_id AND id=NEW.representation_id;
 actual=jsonb_build_object('evidenceId',NEW.id,'documentId',NEW.document_id,'versionId',NEW.version_id,'versionNumber',v.number,'representationId',NEW.representation_id,'sourceTitle',v.frozen_title,'sourcePurpose',v.frozen_purpose,'filename',p.file_name,'mediaType',p.media_type,'sizeBytes',p.size,'sha256',p.sha256,'locator',NEW.snapshot->'locator','supportNote',NEW.snapshot->'supportNote');
 IF h.id IS NULL OR d.id IS NULL OR d.type<>'received-audit-source' OR d.client_id<>h.original_client_id OR d.project_id IS NOT NULL OR v.id IS NULL OR NOT documents_frozen_pdf(v,p) OR NEW.snapshot IS DISTINCT FROM actual OR NOT working_evidence_text_valid(NEW.snapshot->>'supportNote',2000) OR ((NEW.snapshot->'locator')<>'null'::jsonb AND NOT working_evidence_text_valid(NEW.snapshot->>'locator',500)) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='working_evidence_exact_support',MESSAGE='An exact frozen native original is required.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION task_result_declaration_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior_id uuid; prior_revision integer;
BEGIN
  PERFORM id FROM tasks
    WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id AND id = NEW.task_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid Task result target' USING ERRCODE = '23514', CONSTRAINT = 'task_result_declarations_reference_guard';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tasks t
    JOIN working_documents d ON d.workspace_id=t.workspace_id AND d.company_id=t.company_id
      AND d.id=NEW.document_id AND d.client_id=t.client_account_id AND d.project_id=t.project_id
      AND d.type='mission-deliverable'
    JOIN document_versions v ON v.workspace_id=d.workspace_id AND v.company_id=d.company_id
      AND v.document_id=d.id AND v.id=NEW.version_id
      AND v.frozen_title IS NOT NULL
    JOIN document_pdfs p ON p.workspace_id=v.workspace_id AND p.company_id=v.company_id
      AND p.document_id=v.document_id AND p.version_id=v.id AND p.id=NEW.pdf_id
    WHERE t.workspace_id=NEW.workspace_id AND t.company_id=NEW.company_id AND t.id=NEW.task_id
      AND t.status IN ('todo','in_progress','blocked')
      AND documents_frozen_pdf(v,p)
  ) THEN
    RAISE EXCEPTION 'Invalid frozen mission Task result reference' USING ERRCODE = '23514', CONSTRAINT = 'task_result_declarations_reference_guard';
  END IF;
  SELECT id, revision INTO prior_id, prior_revision FROM task_result_declarations
    WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND task_id=NEW.task_id
    ORDER BY revision DESC LIMIT 1;
  IF NEW.revision <> COALESCE(prior_revision,0)+1 OR NEW.predecessor_id IS DISTINCT FROM prior_id THEN
    RAISE EXCEPTION 'Invalid Task result predecessor' USING ERRCODE = '23514', CONSTRAINT = 'task_result_declarations_predecessor_guard';
  END IF;
  RETURN NEW;
END $$;
