'use client';

import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Footprints,
  Move,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Trash2,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FORMATION_LABELS,
  autoPlaceTeamMarkers,
  formationsForPlayerCount,
  goalkeeperForTeam,
  playersAvailableForTactics,
  resolvedFormationLabel,
} from '@/lib/football-tactics';
import {
  type Match,
  type TacticMarker,
  type TacticFormation,
  type TacticPath,
  type TacticStep,
  type TacticsBoard,
  type Player,
  type PlayerPosition,
  type Tournament,
} from '@/lib/football-types';
import { COLOR_HEX, COLOR_LABEL, PageHeader, TeamShirtIcon } from './shared';

const PLAYER_POSITION_SHORT: Record<PlayerPosition, string> = {
  defender: 'D',
  midfielder: 'M',
  winger: 'W',
  forward: 'F',
};

const PLAYBACK_MOVE_MS = 1800;
const PLAYBACK_STEP_MS = 2500;
const PLAYBACK_START_DELAY_MS = 350;

function markerIdentity(marker: TacticMarker) {
  return marker.kind === 'ball'
    ? 'ball'
    : `${marker.teamId ?? ''}:${marker.playerId ?? marker.id}`;
}

function markersByTeamSlot(markers: TacticMarker[]) {
  const slots = new Map<string, TacticMarker[]>();
  for (const marker of markers) {
    if (marker.kind !== 'player') continue;
    const teamId = marker.teamId ?? '';
    const list = slots.get(teamId);
    if (list) list.push(marker);
    else slots.set(teamId, [marker]);
  }
  return slots;
}

function reconcileMarkers(
  freshMarkers: TacticMarker[],
  storedMarkers: TacticMarker[],
) {
  const storedByIdentity = new Map(
    storedMarkers.map((marker) => [markerIdentity(marker), marker]),
  );
  const storedSlots = markersByTeamSlot(storedMarkers);
  const slotCursor = new Map<string, number>();
  return freshMarkers.map((marker) => {
    const stored = storedByIdentity.get(markerIdentity(marker));
    if (marker.kind !== 'player')
      return stored ? { ...marker, x: stored.x, y: stored.y } : marker;
    const teamId = marker.teamId ?? '';
    const slot = slotCursor.get(teamId) ?? 0;
    slotCursor.set(teamId, slot + 1);
    if (stored) return { ...marker, x: stored.x, y: stored.y };
    // A placeholder and the real player who replaces it share a slot, so keep
    // the shape arranged while the roster was still empty.
    const placeholder = storedSlots.get(teamId)?.[slot];
    return placeholder && !placeholder.playerId
      ? { ...marker, x: placeholder.x, y: placeholder.y }
      : marker;
  });
}

function reconcileBoard(
  tournament: Tournament,
  storedBoard: TacticsBoard,
): TacticsBoard {
  const fresh = makeBoard(tournament, storedBoard);
  return {
    ...fresh,
    notes: storedBoard.notes,
    animationSteps: storedBoard.animationSteps?.map((step) => ({
      ...step,
      markers: reconcileMarkers(fresh.markers, step.markers),
      paths: step.paths.map((path) => ({
        ...path,
        from: { ...path.from },
        to: { ...path.to },
      })),
    })),
    markers: reconcileMarkers(fresh.markers, storedBoard.markers),
  };
}

function goalkeeperFromMatch(match: Match | undefined, teamId: string) {
  if (!match) return undefined;
  if (match.teamAId === teamId) return match.teamAGkPlayerId;
  if (match.teamBId === teamId) return match.teamBGkPlayerId;
  return undefined;
}

function playerPositionLabel(player?: Player) {
  return player?.positions
    ?.map((position) => PLAYER_POSITION_SHORT[position])
    .join('/');
}

// autoPlaceTeamMarkers puts each keeper on its own goal spot: y 91 for team A
// and y 9 for team B.
function isInGoalZone(position: { x: number; y: number }, isTeamA: boolean) {
  return (
    Math.abs(position.x - 50) <= 12 &&
    Math.abs(position.y - (isTeamA ? 91 : 9)) <= 7
  );
}

function makeBoard(
  tournament: Tournament,
  setup: Partial<TacticsBoard> = {},
): TacticsBoard {
  const defaultMatch =
    tournament.matches.find((match) => match.status === 'current') ??
    tournament.matches.find((match) => match.status === 'upcoming') ??
    tournament.matches[0];
  const selectedMatch = setup.matchId
    ? tournament.matches.find((match) => match.id === setup.matchId)
    : setup.teamAId || setup.teamBId
      ? undefined
      : defaultMatch;
  const teamAId =
    setup.teamAId ?? selectedMatch?.teamAId ?? tournament.teams[0]?.id ?? '';
  const teamBId =
    setup.teamBId ??
    selectedMatch?.teamBId ??
    tournament.teams.find((team) => team.id !== teamAId)?.id ??
    '';
  const teamA = tournament.teams.find((team) => team.id === teamAId);
  const teamB = tournament.teams.find((team) => team.id === teamBId);
  const playerCount = setup.playerCount ?? 7;
  const teamAFormation = setup.teamAFormation ?? 'auto';
  const teamBFormation = setup.teamBFormation ?? 'auto';
  const teamAGk = teamA
    ? goalkeeperForTeam(
        teamA,
        setup.teamAGkPlayerId ?? goalkeeperFromMatch(selectedMatch, teamAId),
      )
    : undefined;
  const teamBGk = teamB
    ? goalkeeperForTeam(
        teamB,
        setup.teamBGkPlayerId ?? goalkeeperFromMatch(selectedMatch, teamBId),
      )
    : undefined;
  return {
    teamAId,
    teamBId,
    matchId: selectedMatch?.id,
    playerCount,
    teamAFormation,
    teamBFormation,
    teamAGkPlayerId: teamAGk?.id,
    teamBGkPlayerId: teamBGk?.id,
    markers: [
      ...(teamA
        ? autoPlaceTeamMarkers({
            team: teamA,
            isTeamA: true,
            playerCount,
            formation: teamAFormation,
            goalkeeperId: teamAGk?.id,
          })
        : []),
      ...(teamB
        ? autoPlaceTeamMarkers({
            team: teamB,
            isTeamA: false,
            playerCount,
            formation: teamBFormation,
            goalkeeperId: teamBGk?.id,
          })
        : []),
      {
        id: 'tactic-ball',
        kind: 'ball',
        label: 'บอล',
        x: 50,
        y: 50,
      },
    ],
    notes: '',
  };
}

function markerLabel(marker: TacticMarker, tournament: Tournament) {
  if (marker.kind === 'ball') return '⚽';
  const team = tournament.teams.find((item) => item.id === marker.teamId);
  return (
    team?.players.find((player) => player.id === marker.playerId)?.name ||
    marker.label
  );
}

type TacticTool = 'move' | 'run' | 'pass';
type TacticMode = 'position' | 'animation';

function prototypeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function copyMarkers(markers: TacticMarker[]) {
  return markers.map((marker) => ({ ...marker }));
}

function copySteps(steps: TacticStep[]) {
  return steps.map((step) => ({
    ...step,
    markers: copyMarkers(step.markers),
    paths: step.paths.map((path) => ({
      ...path,
      from: { ...path.from },
      to: { ...path.to },
    })),
  }));
}

function initialStepsForBoard(board: TacticsBoard) {
  return board.animationSteps?.length
    ? copySteps(board.animationSteps)
    : [
        {
          id: prototypeId('step'),
          title: 'ตำแหน่งเริ่มต้น',
          markers: copyMarkers(board.markers),
          paths: [],
        },
      ];
}

function markersAtPathDestinations(step: TacticStep) {
  const nextMarkers = copyMarkers(step.markers);
  for (const path of step.paths) {
    const targetMarker =
      path.kind === 'pass'
        ? step.markers.find((marker) => marker.kind === 'ball')
        : step.markers
            .filter((marker) => marker.kind === 'player')
            .map((marker) => ({
              marker,
              distance: Math.hypot(
                marker.x - path.from.x,
                marker.y - path.from.y,
              ),
            }))
            .sort((first, second) => first.distance - second.distance)
            .find(({ distance }) => distance <= 10)?.marker;
    if (!targetMarker) continue;
    const index = nextMarkers.findIndex(
      (marker) => marker.id === targetMarker.id,
    );
    if (index >= 0)
      nextMarkers[index] = {
        ...nextMarkers[index],
        x: path.to.x,
        y: path.to.y,
      };
  }
  return nextMarkers;
}

export function TacticsScreen({
  tournament,
  onUpdate,
  onCopyLink,
}: {
  tournament: Tournament;
  onUpdate: (value: Tournament) => void;
  onCopyLink: () => void;
}) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const [dragPreview, setDragPreview] = useState<{
    markerId: string;
    x: number;
    y: number;
  } | null>(null);
  const storedBoard = tournament.tactics;
  const hasValidTeams =
    storedBoard &&
    tournament.teams.some((team) => team.id === storedBoard.teamAId) &&
    tournament.teams.some((team) => team.id === storedBoard.teamBId) &&
    storedBoard.teamAId !== storedBoard.teamBId;
  const candidateBoard = hasValidTeams ? storedBoard : makeBoard(tournament);
  const initialBoard = reconcileBoard(tournament, candidateBoard);
  const [board, setBoard] = useState(initialBoard);
  const [steps, setSteps] = useState<TacticStep[]>(() =>
    initialStepsForBoard(initialBoard),
  );
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [mode, setMode] = useState<TacticMode>('position');
  const [animationHasContent, setAnimationHasContent] = useState(
    Boolean(initialBoard.animationSteps?.length),
  );
  const [tool, setTool] = useState<TacticTool>('move');
  const [pathPreview, setPathPreview] = useState<{
    kind: 'run' | 'pass';
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPathsDuringPlayback, setShowPathsDuringPlayback] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const latestTournamentRef = useRef(tournament);
  const onUpdateRef = useRef(onUpdate);
  const autosaveTimerRef = useRef<number | null>(null);
  const pendingPlanRef = useRef<TacticsBoard | null>(null);
  const sourceTacticsSignature = JSON.stringify(tournament.tactics ?? null);
  const sourceRosterSignature = JSON.stringify(tournament.teams);
  const lastPublishedSignatureRef = useRef(sourceTacticsSignature);
  const lastRosterSignatureRef = useRef(sourceRosterSignature);
  const initialPersistedBoard = {
    ...initialBoard,
    animationSteps: initialBoard.animationSteps?.length ? steps : undefined,
  };
  const lastLocalSignatureRef = useRef(JSON.stringify(initialPersistedBoard));
  const persistedBoard = useMemo(
    () => ({
      ...board,
      animationSteps: animationHasContent ? steps : undefined,
    }),
    [animationHasContent, board, steps],
  );
  const localPlanSignature = JSON.stringify(persistedBoard);
  const currentStep = steps[activeStepIndex] ?? steps[0];
  const visibleMarkers =
    mode === 'position'
      ? board.markers
      : (currentStep?.markers ?? board.markers);
  const visiblePaths =
    mode === 'position'
      ? []
      : isPlaying
        ? showPathsDuringPlayback
          ? activeStepIndex > 0
            ? (steps[activeStepIndex - 1]?.paths ?? [])
            : (currentStep?.paths ?? [])
          : []
        : (currentStep?.paths ?? []);
  const teamA = tournament.teams.find((team) => team.id === board.teamAId);
  const teamB = tournament.teams.find((team) => team.id === board.teamBId);
  const playerCount = board.playerCount ?? 6;
  const teamAFormation = board.teamAFormation ?? 'auto';
  const teamBFormation = board.teamBFormation ?? 'auto';
  const onFieldPlayerIds = new Set(
    board.markers.flatMap((marker) =>
      marker.kind === 'player' && marker.playerId ? [marker.playerId] : [],
    ),
  );
  const benchA = teamA
    ? playersAvailableForTactics(teamA).filter(
        (player) => !onFieldPlayerIds.has(player.id),
      )
    : [];
  const benchB = teamB
    ? playersAvailableForTactics(teamB).filter(
        (player) => !onFieldPlayerIds.has(player.id),
      )
    : [];

  useEffect(() => {
    latestTournamentRef.current = tournament;
    onUpdateRef.current = onUpdate;
  }, [onUpdate, tournament]);

  useEffect(() => {
    if (!isPlaying) return;
    const reachedLastStep = activeStepIndex >= steps.length - 1;
    const timer = window.setTimeout(
      () => {
        if (reachedLastStep) setIsPlaying(false);
        else setActiveStepIndex((index) => index + 1);
      },
      reachedLastStep
        ? PLAYBACK_STEP_MS
        : activeStepIndex === 0
          ? PLAYBACK_START_DELAY_MS
          : PLAYBACK_STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [activeStepIndex, isPlaying, steps.length]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (
      sourceTacticsSignature === lastPublishedSignatureRef.current &&
      sourceRosterSignature === lastRosterSignatureRef.current
    )
      return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    pendingPlanRef.current = null;
    const stored = tournament.tactics;
    const validStoredTeams =
      stored &&
      tournament.teams.some((team) => team.id === stored.teamAId) &&
      tournament.teams.some((team) => team.id === stored.teamBId) &&
      stored.teamAId !== stored.teamBId;
    const nextBoard = reconcileBoard(
      tournament,
      validStoredTeams ? stored : makeBoard(tournament),
    );
    const nextSteps = initialStepsForBoard(nextBoard);
    const hasAnimation = Boolean(nextBoard.animationSteps?.length);
    lastPublishedSignatureRef.current = sourceTacticsSignature;
    lastRosterSignatureRef.current = sourceRosterSignature;
    lastLocalSignatureRef.current = JSON.stringify({
      ...nextBoard,
      animationSteps: hasAnimation ? nextSteps : undefined,
    });
    setBoard(nextBoard);
    setSteps(nextSteps);
    setAnimationHasContent(hasAnimation);
    setActiveStepIndex(0);
    setIsPlaying(false);
    setPathPreview(null);
    setTool('move');
  }, [sourceRosterSignature, sourceTacticsSignature, tournament]);

  useEffect(() => {
    if (localPlanSignature === lastLocalSignatureRef.current) return;
    pendingPlanRef.current = persistedBoard;
    if (autosaveTimerRef.current !== null)
      window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      const plan = pendingPlanRef.current;
      if (!plan) return;
      pendingPlanRef.current = null;
      const signature = JSON.stringify(plan);
      lastLocalSignatureRef.current = signature;
      lastPublishedSignatureRef.current = signature;
      onUpdateRef.current({
        ...latestTournamentRef.current,
        tactics: plan,
      });
    }, 700);
  }, [localPlanSignature, persistedBoard]);

  useEffect(
    () => () => {
      if (autosaveTimerRef.current !== null)
        window.clearTimeout(autosaveTimerRef.current);
      const plan = pendingPlanRef.current;
      if (!plan) return;
      const signature = JSON.stringify(plan);
      lastLocalSignatureRef.current = signature;
      lastPublishedSignatureRef.current = signature;
      onUpdateRef.current({
        ...latestTournamentRef.current,
        tactics: plan,
      });
    },
    [],
  );

  function resetBoard(
    setup: Partial<TacticsBoard> = {},
    { keepAnimation = false } = {},
  ) {
    const nextBoard = {
      ...makeBoard(tournament, { ...board, ...setup }),
      notes: board.notes,
    };
    setBoard(nextBoard);
    // Reshaping a lineup should not discard the animation built on top of it,
    // so re-anchor every step onto the new markers the way a reload does.
    const keptSteps =
      keepAnimation && animationHasContent
        ? steps.map((step) => ({
            ...step,
            markers: reconcileMarkers(nextBoard.markers, step.markers),
          }))
        : null;
    setSteps(
      keptSteps ?? [
        {
          id: prototypeId('step'),
          title: 'ตำแหน่งเริ่มต้น',
          markers: copyMarkers(nextBoard.markers),
          paths: [],
        },
      ],
    );
    setActiveStepIndex(
      keptSteps ? Math.min(activeStepIndex, keptSteps.length - 1) : 0,
    );
    setTool('move');
    setPathPreview(null);
    setIsPlaying(false);
    setAnimationHasContent(Boolean(keptSteps));
  }

  function resetCurrentMode() {
    if (mode === 'position') {
      const nextBoard = {
        ...makeBoard(tournament, board),
        notes: board.notes,
        animationSteps: board.animationSteps,
      };
      setBoard(nextBoard);
      setNotice('จัดผู้เล่นตามแผนและตำแหน่งที่เล่นได้แล้ว');
    } else {
      setSteps([
        {
          id: prototypeId('step'),
          title: 'ตำแหน่งเริ่มต้น',
          markers: copyMarkers(board.markers),
          paths: [],
        },
      ]);
      setAnimationHasContent(false);
      setNotice('ล้างเฉพาะแผน Animation แล้ว ตำแหน่งปกติยังอยู่');
    }
    setActiveStepIndex(0);
    setTool('move');
    setPathPreview(null);
    setIsPlaying(false);
    setConfirmingReset(false);
  }

  function moveMarker(markerId: string, x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const position = {
      x: Math.min(95, Math.max(5, x)),
      y: Math.min(97, Math.max(3, y)),
    };
    if (mode === 'position') {
      setBoard((current) => {
        const moved = current.markers.find((marker) => marker.id === markerId);
        const next = {
          ...current,
          markers: current.markers.map((marker) =>
            marker.id === markerId ? { ...marker, ...position } : marker,
          ),
        };
        if (moved?.kind !== 'player' || !moved.playerId) return next;
        const isTeamA = moved.teamId === current.teamAId;
        if (!isTeamA && moved.teamId !== current.teamBId) return next;
        if (!isInGoalZone(position, isTeamA)) return next;
        // Keep the stored keeper in step with whoever now stands in goal, so
        // rebuilding the board does not drag the previous keeper back.
        return isTeamA
          ? { ...next, teamAGkPlayerId: moved.playerId }
          : { ...next, teamBGkPlayerId: moved.playerId };
      });
      return;
    }
    setAnimationHasContent(true);
    setSteps((current) =>
      current.map((step, index) =>
        index === activeStepIndex
          ? {
              ...step,
              markers: step.markers.map((marker) =>
                marker.id === markerId
                  ? {
                      ...marker,
                      ...position,
                    }
                  : marker,
              ),
            }
          : step,
      ),
    );
  }

  function positionFromPointer(clientX: number, clientY: number) {
    const pitch = pitchRef.current;
    if (!pitch) return null;
    const bounds = pitch.getBoundingClientRect();
    // A pointer event can arrive before the pitch has been laid out, and
    // dividing by a zero-sized box would store NaN coordinates.
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: Math.min(
        95,
        Math.max(5, ((clientX - bounds.left) / bounds.width) * 100),
      ),
      y: Math.min(
        97,
        Math.max(3, ((clientY - bounds.top) / bounds.height) * 100),
      ),
    };
  }

  function moveFromKeyboard(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    marker: TacticMarker,
  ) {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-2, 0],
      ArrowRight: [2, 0],
      ArrowUp: [0, -2],
      ArrowDown: [0, 2],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    moveMarker(marker.id, marker.x + step[0], marker.y + step[1]);
  }

  function changeTeamA(teamAId: string) {
    const teamBId =
      board.teamBId === teamAId
        ? (tournament.teams.find((team) => team.id !== teamAId)?.id ?? '')
        : board.teamBId;
    resetBoard({
      matchId: undefined,
      teamAId,
      teamBId,
      teamAGkPlayerId: undefined,
      teamBGkPlayerId: undefined,
    });
  }

  function changeTeamB(teamBId: string) {
    resetBoard({
      matchId: undefined,
      teamBId,
      teamAGkPlayerId: undefined,
      teamBGkPlayerId: undefined,
    });
  }

  function changeMode(nextMode: TacticMode) {
    setIsPlaying(false);
    setPathPreview(null);
    setTool('move');
    if (nextMode === 'animation' && !animationHasContent) {
      setSteps((current) =>
        current.map((step, index) =>
          index === 0 ? { ...step, markers: copyMarkers(board.markers) } : step,
        ),
      );
      setActiveStepIndex(0);
    }
    setMode(nextMode);
  }

  function addStep() {
    if (!currentStep || steps.length >= 8) return;
    // Inserting into the list the playback timer is walking would land the new
    // step somewhere the user did not aim for.
    setIsPlaying(false);
    setAnimationHasContent(true);
    const nextStep: TacticStep = {
      id: prototypeId('step'),
      title: `จังหวะ ${steps.length + 1}`,
      markers: markersAtPathDestinations(currentStep),
      paths: [],
    };
    setSteps((current) => [
      ...current.slice(0, activeStepIndex + 1),
      nextStep,
      ...current.slice(activeStepIndex + 1),
    ]);
    setActiveStepIndex(activeStepIndex + 1);
    setTool('move');
    setPathPreview(null);
    setNotice(
      currentStep.paths.length
        ? 'สร้างจังหวะใหม่และขยับตัวตามลูกศรแล้ว'
        : 'สร้างจังหวะใหม่แล้ว ลากตัวไปตำแหน่งถัดไปได้เลย',
    );
  }

  function removeStep() {
    if (steps.length <= 1) return;
    setAnimationHasContent(true);
    setSteps((current) =>
      current.filter((_, index) => index !== activeStepIndex),
    );
    setActiveStepIndex(Math.max(0, activeStepIndex - 1));
    setPathPreview(null);
    setIsPlaying(false);
  }

  function updateStepTitle(value: string) {
    setAnimationHasContent(true);
    setSteps((current) =>
      current.map((step, index) =>
        index === activeStepIndex
          ? { ...step, title: value.slice(0, 40) }
          : step,
      ),
    );
  }

  function chooseTool(nextTool: TacticTool) {
    setTool(nextTool);
    setPathPreview(null);
    setIsPlaying(false);
  }

  function clearPaths() {
    setAnimationHasContent(true);
    setSteps((current) =>
      current.map((step, index) =>
        index === activeStepIndex ? { ...step, paths: [] } : step,
      ),
    );
    setPathPreview(null);
  }

  function undoLastPath() {
    setAnimationHasContent(true);
    setSteps((current) =>
      current.map((step, index) =>
        index === activeStepIndex
          ? { ...step, paths: step.paths.slice(0, -1) }
          : step,
      ),
    );
    setPathPreview(null);
  }

  function togglePlayback() {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (steps.length < 2) {
      setNotice('เพิ่มอย่างน้อย 2 จังหวะก่อนเล่นแผน');
      return;
    }
    if (activeStepIndex >= steps.length - 1) setActiveStepIndex(0);
    setIsPlaying(true);
    setTool('move');
    setPathPreview(null);
  }

  function savePlan() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    pendingPlanRef.current = null;
    lastLocalSignatureRef.current = localPlanSignature;
    lastPublishedSignatureRef.current = localPlanSignature;
    onUpdateRef.current({
      ...latestTournamentRef.current,
      tactics: persistedBoard,
    });
    setNotice('บันทึกกระดานแท็กติกเข้าเกมแล้ว');
  }

  const toolOptions: Array<{
    id: TacticTool;
    label: string;
    icon: typeof Move;
  }> = [
    { id: 'move', label: 'ย้าย', icon: Move },
    { id: 'run', label: 'เส้นวิ่ง', icon: Footprints },
    { id: 'pass', label: 'ส่งบอล', icon: ArrowRight },
  ];

  return (
    <>
      <PageHeader title="กระดานแท็กติก" eyebrow={tournament.name} />
      <div className="flex flex-col gap-4 px-4 py-4 pb-8">
        <section className="settings-card order-1 space-y-2">
          <div>
            <h2 className="section-title">รูปแบบกระดาน</h2>
            <p className="section-note">เลือกตามสิ่งที่ต้องการอธิบายให้เพื่อนดู</p>
          </div>
          <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              aria-pressed={mode === 'position'}
              onClick={() => changeMode('position')}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-black transition-colors ${mode === 'position' ? 'bg-white text-[#087632] shadow-sm' : 'text-slate-500'}`}
            >
              <Move className="h-4 w-4" />
              วางตำแหน่ง
            </button>
            <button
              type="button"
              aria-pressed={mode === 'animation'}
              onClick={() => changeMode('animation')}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-black transition-colors ${mode === 'animation' ? 'bg-[#11823b] text-white shadow-sm' : 'text-slate-500'}`}
            >
              <Play className="h-4 w-4" />
              Animation
            </button>
          </div>
        </section>
        <Collapsible
          open={setupOpen}
          onOpenChange={setSetupOpen}
          className={mode === 'animation' ? 'order-4' : 'order-3'}
        >
          <CollapsibleTrigger className="settings-card flex w-full items-center justify-between gap-3 text-left">
            <div className="min-w-0">
              <h2 className="section-title">ตั้งค่าผู้เล่นและแผน</h2>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
                {teamA?.name ?? 'ทีมแรก'} vs {teamB?.name ?? 'ทีมที่สอง'} ·{' '}
                {playerCount} คน ·{' '}
                {resolvedFormationLabel(teamAFormation, playerCount)} /{' '}
                {resolvedFormationLabel(teamBFormation, playerCount)}
              </p>
            </div>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${setupOpen ? 'rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            <section className="settings-card space-y-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <select
                  aria-label="ทีมฝั่งล่าง"
                  value={board.teamAId}
                  onChange={(event) => changeTeamA(event.target.value)}
                  className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-sm font-black outline-none focus:border-[#35a95f]"
                >
                  {tournament.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {COLOR_LABEL[team.color]} · {team.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-black text-slate-400">VS</span>
                <select
                  aria-label="ทีมฝั่งบน"
                  value={board.teamBId}
                  onChange={(event) => changeTeamB(event.target.value)}
                  className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-sm font-black outline-none focus:border-[#35a95f]"
                >
                  {tournament.teams.map((team) => (
                    <option
                      key={team.id}
                      value={team.id}
                      disabled={team.id === board.teamAId}
                    >
                      {COLOR_LABEL[team.color]} · {team.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-black text-slate-500">
                  จำนวนผู้เล่นในสนามต่อทีม
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {([5, 6, 7] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      aria-pressed={playerCount === count}
                      onClick={() =>
                        resetBoard(
                          {
                            playerCount: count,
                            teamAFormation: 'auto',
                            teamBFormation: 'auto',
                          },
                          { keepAnimation: true },
                        )
                      }
                      className={`h-10 rounded-xl text-sm font-black ${playerCount === count ? 'bg-[#11823b] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                    >
                      {count} คน
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                {[
                  {
                    team: teamA,
                    formation: teamAFormation,
                    formationKey: 'teamAFormation' as const,
                  },
                  {
                    team: teamB,
                    formation: teamBFormation,
                    formationKey: 'teamBFormation' as const,
                  },
                ].map((side) => (
                  <div
                    key={side.team?.id ?? side.formationKey}
                    className="rounded-2xl bg-slate-50 p-3"
                  >
                    <div className="mb-2 flex min-w-0 items-center gap-2">
                      {side.team && (
                        <TeamShirtIcon color={side.team.color} size="xs" />
                      )}
                      <p className="truncate text-sm font-black">
                        {side.team?.name ?? 'ยังไม่มีทีม'}
                      </p>
                    </div>
                    <label className="block text-[11px] font-black text-slate-400">
                      แผนการเล่น
                      <select
                        aria-label={`แผนการเล่น ${side.team?.name ?? ''}`}
                        value={side.formation}
                        onChange={(event) =>
                          resetBoard(
                            {
                              [side.formationKey]: event.target
                                .value as TacticFormation,
                            },
                            { keepAnimation: true },
                          )
                        }
                        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-800 outline-none"
                      >
                        {formationsForPlayerCount(playerCount).map(
                          (formation) => (
                            <option key={formation} value={formation}>
                              {FORMATION_LABELS[formation]}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-[#eef8f1] px-3 py-2 text-xs font-bold text-[#087632]">
                เลือกจำนวนคนหรือแผนแล้ว กระดานจะจัดใหม่ทันที ·
                ระบบจะวางผู้เล่นหนึ่งคนไว้บริเวณหน้าประตูอัตโนมัติ
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-slate-500">
                  {mode === 'position'
                    ? 'หากลากตำแหน่งแล้วอยากเริ่มใหม่ กดจัดตำแหน่งใหม่'
                    : 'สร้างหลายจังหวะ วาดเส้น แล้วกด Play เพื่อดูการเคลื่อนที่'}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmingReset(true)}
                  className="h-9 shrink-0 rounded-xl px-3 text-xs font-black"
                >
                  <RotateCcw />
                  {mode === 'position' ? 'จัดตำแหน่งใหม่' : 'รีเซ็ต'}
                </Button>
              </div>
            </section>

            {(benchA.length > 0 || benchB.length > 0) && (
              <section className="settings-card space-y-3">
                <div>
                  <h2 className="section-title">ตัวสำรอง</h2>
                  <p className="section-note">ผู้เล่นที่มาวันนี้แต่เกินจำนวนคนในสนาม</p>
                </div>
                <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
                  {[
                    { team: teamA, players: benchA },
                    { team: teamB, players: benchB },
                  ].map((side, index) => (
                    <div
                      key={side.team?.id ?? index}
                      className="rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-black text-slate-600">
                        {side.team && (
                          <TeamShirtIcon color={side.team.color} size="xs" />
                        )}
                        {side.team?.name}
                      </div>
                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {side.players.length
                          ? side.players.map((player) => player.name).join(', ')
                          : 'ไม่มีตัวสำรอง'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </CollapsibleContent>
        </Collapsible>

        {mode === 'animation' && (
          <section className="settings-card order-2 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="section-title">จังหวะการเล่น</h2>
                <p className="section-note">
                  จังหวะ {activeStepIndex + 1} จาก {steps.length} · สูงสุด 8 จังหวะ
                </p>
              </div>
              <Button
                type="button"
                onClick={addStep}
                disabled={steps.length >= 8}
                className="h-10 rounded-xl bg-[#11823b] px-3 text-xs font-black"
              >
                <Plus />
                เพิ่มจังหวะ
              </Button>
            </div>
            <div className="space-y-2 rounded-2xl bg-[#eef8f1] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-[#11823b]">
                    ดูตัวอย่างการเคลื่อนที่
                  </p>
                  <p className="truncate text-sm font-black text-slate-800">
                    {isPlaying ? 'กำลังเล่น…' : currentStep?.title}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={activeStepIndex === 0 || isPlaying}
                    onClick={() => setActiveStepIndex((index) => index - 1)}
                    aria-label="จังหวะก่อนหน้า"
                    className="h-9 w-9 rounded-full bg-white p-0"
                  >
                    <ArrowLeft />
                  </Button>
                  <Button
                    type="button"
                    onClick={togglePlayback}
                    aria-label={isPlaying ? 'หยุดเล่นแผน' : 'เล่นแผน'}
                    className="h-11 w-11 rounded-full bg-[#11823b] p-0"
                  >
                    {isPlaying ? <Pause /> : <Play />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={activeStepIndex >= steps.length - 1 || isPlaying}
                    onClick={() => setActiveStepIndex((index) => index + 1)}
                    aria-label="จังหวะถัดไป"
                    className="h-9 w-9 rounded-full bg-white p-0"
                  >
                    <ArrowRight />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {steps.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    aria-label={`ไปจังหวะ ${index + 1}`}
                    onClick={() => {
                      setActiveStepIndex(index);
                      setIsPlaying(false);
                    }}
                    className={`h-2 flex-1 rounded-full transition-colors ${index <= activeStepIndex ? 'bg-[#11823b]' : 'bg-white'}`}
                  />
                ))}
              </div>
              <label className="flex min-h-9 items-center justify-between gap-3 rounded-xl bg-white/80 px-3 text-xs font-black text-slate-700">
                <span>แสดงลูกศรตอนเล่น</span>
                <input
                  type="checkbox"
                  checked={showPathsDuringPlayback}
                  onChange={(event) =>
                    setShowPathsDuringPlayback(event.target.checked)
                  }
                  className="h-4 w-4 shrink-0 accent-[#11823b]"
                />
              </label>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    setActiveStepIndex(index);
                    setIsPlaying(false);
                    setPathPreview(null);
                  }}
                  className={`h-10 shrink-0 rounded-xl px-3 text-sm font-black ${index === activeStepIndex ? 'bg-[#11823b] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                >
                  {index + 1}. {step.title || `จังหวะ ${index + 1}`}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                aria-label="ชื่อจังหวะ"
                value={currentStep?.title ?? ''}
                onChange={(event) => updateStepTitle(event.target.value)}
                // Playback moves the active step every few seconds, so editing
                // it mid-run drops the text into whichever step is on screen.
                disabled={isPlaying}
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-[#35a95f] disabled:opacity-50"
                placeholder="ตั้งชื่อจังหวะ"
              />
              <Button
                type="button"
                variant="outline"
                onClick={removeStep}
                disabled={isPlaying || steps.length <= 1}
                aria-label="ลบจังหวะนี้"
                className="h-11 w-11 shrink-0 rounded-xl p-0 text-red-600"
              >
                <Trash2 />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {toolOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={tool === option.id}
                    onClick={() => chooseTool(option.id)}
                    className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-black ${tool === option.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            {tool !== 'move' && (
              <div className="space-y-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                <div className="flex items-center justify-between">
                  <span>กดลากจากจุดใดก็ได้ไปยังพื้นที่หรือประตู</span>
                  <div className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      onClick={undoLastPath}
                      disabled={!currentStep?.paths.length}
                      className="font-black text-slate-700 disabled:opacity-35"
                    >
                      ย้อนเส้น
                    </button>
                    <button
                      type="button"
                      onClick={clearPaths}
                      disabled={!currentStep?.paths.length}
                      className="font-black text-red-600 disabled:opacity-35"
                    >
                      ล้าง
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[#087632]">
                  เพิ่มจังหวะแล้ว ผู้เล่นตามเส้นวิ่งและลูกบอลตามเส้นส่งจะขยับให้ทันที
                </p>
              </div>
            )}
          </section>
        )}

        <section
          ref={pitchRef}
          aria-label={`กระดานแท็กติก ${teamA?.name ?? ''} พบ ${teamB?.name ?? ''}`}
          onPointerDown={(event) => {
            if (tool === 'move' || isPlaying) return;
            event.preventDefault();
            const position = positionFromPointer(event.clientX, event.clientY);
            if (!position) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setPathPreview({ kind: tool, from: position, to: position });
          }}
          onPointerMove={(event) => {
            if (
              !pathPreview ||
              !event.currentTarget.hasPointerCapture(event.pointerId)
            )
              return;
            event.preventDefault();
            const position = positionFromPointer(event.clientX, event.clientY);
            if (position)
              setPathPreview((current) =>
                current ? { ...current, to: position } : current,
              );
          }}
          onPointerUp={(event) => {
            if (
              !pathPreview ||
              !event.currentTarget.hasPointerCapture(event.pointerId)
            )
              return;
            event.preventDefault();
            const position =
              positionFromPointer(event.clientX, event.clientY) ??
              pathPreview.to;
            const distance = Math.hypot(
              position.x - pathPreview.from.x,
              position.y - pathPreview.from.y,
            );
            if (distance >= 3) {
              setAnimationHasContent(true);
              const nextPath: TacticPath = {
                id: prototypeId('path'),
                kind: pathPreview.kind,
                from: pathPreview.from,
                to: position,
              };
              setSteps((current) =>
                current.map((step, index) =>
                  index === activeStepIndex
                    ? { ...step, paths: [...step.paths, nextPath] }
                    : step,
                ),
              );
            }
            setPathPreview(null);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            setPathPreview(null);
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          className={`relative ${mode === 'animation' ? 'order-3' : 'order-2'} h-[540px] overscroll-contain overflow-hidden rounded-[26px] border-4 border-white bg-[linear-gradient(180deg,#198b48_0%,#147b3f_50%,#198b48_100%)] shadow-[0_12px_30px_rgba(15,80,40,.22)] select-none ${tool === 'move' ? 'touch-pan-y' : 'touch-none cursor-crosshair'}`}
        >
          <div className="pointer-events-none absolute inset-3 border-2 border-white/80" />
          <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t-2 border-white/80" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85" />
          <div className="pointer-events-none absolute left-1/2 top-3 h-20 w-3/5 -translate-x-1/2 border-2 border-t-0 border-white/80" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 h-20 w-3/5 -translate-x-1/2 border-2 border-b-0 border-white/80" />
          <div className="pointer-events-none absolute left-1/2 top-3 h-8 w-1/3 -translate-x-1/2 border-2 border-t-0 border-white/80" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 h-8 w-1/3 -translate-x-1/2 border-2 border-b-0 border-white/80" />

          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
          >
            <defs>
              <marker
                id="tactic-run-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="#ff9f1c" />
              </marker>
              <marker
                id="tactic-pass-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="#ffffff" />
              </marker>
            </defs>
            {[
              ...visiblePaths,
              ...(pathPreview ? [{ id: 'path-preview', ...pathPreview }] : []),
            ].map((path) => {
              const isRun = path.kind === 'run';
              return (
                <line
                  key={path.id}
                  x1={`${path.from.x}%`}
                  y1={`${path.from.y}%`}
                  x2={`${path.to.x}%`}
                  y2={`${path.to.y}%`}
                  stroke={isRun ? '#ff9f1c' : '#ffffff'}
                  strokeWidth="4"
                  strokeDasharray={isRun ? '10 8' : undefined}
                  strokeLinecap="round"
                  opacity={path.id === 'path-preview' ? 0.72 : 1}
                  markerEnd={`url(#${isRun ? 'tactic-run-arrow' : 'tactic-pass-arrow'})`}
                  className="drop-shadow-md"
                />
              );
            })}
          </svg>

          {visibleMarkers.map((marker) => {
            const team = tournament.teams.find(
              (item) => item.id === marker.teamId,
            );
            const label = markerLabel(marker, tournament);
            const player = team?.players.find(
              (item) => item.id === marker.playerId,
            );
            const positionLabel = playerPositionLabel(player);
            const isBall = marker.kind === 'ball';
            const preview =
              dragPreview?.markerId === marker.id ? dragPreview : marker;
            return (
              <button
                key={marker.id}
                type="button"
                aria-label={`ย้าย ${label}${positionLabel ? ` ตำแหน่ง ${positionLabel}` : ''}`}
                draggable={false}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isPlaying || tool !== 'move') return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragPreview({
                    markerId: marker.id,
                    x: marker.x,
                    y: marker.y,
                  });
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  event.preventDefault();
                  const position = positionFromPointer(
                    event.clientX,
                    event.clientY,
                  );
                  if (position)
                    setDragPreview({ markerId: marker.id, ...position });
                }}
                onPointerUp={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  event.preventDefault();
                  const position = positionFromPointer(
                    event.clientX,
                    event.clientY,
                  );
                  const finalPosition =
                    position ??
                    (dragPreview?.markerId === marker.id
                      ? dragPreview
                      : marker);
                  moveMarker(marker.id, finalPosition.x, finalPosition.y);
                  setDragPreview(null);
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={(event) => {
                  if (dragPreview?.markerId === marker.id)
                    moveMarker(marker.id, dragPreview.x, dragPreview.y);
                  setDragPreview(null);
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onLostPointerCapture={() => setDragPreview(null)}
                onDragStart={(event) => event.preventDefault()}
                onKeyDown={(event) => moveFromKeyboard(event, marker)}
                className={`absolute z-10 flex touch-none -translate-x-1/2 -translate-y-1/2 flex-col items-center outline-none will-change-transform focus-visible:ring-4 focus-visible:ring-white/80 ${isPlaying ? 'transition-[left,top] ease-in-out' : ''} ${tool === 'move' && !isPlaying ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
                style={{
                  left: `${preview.x}%`,
                  top: `${preview.y}%`,
                  transitionDuration: isPlaying
                    ? `${PLAYBACK_MOVE_MS}ms`
                    : undefined,
                  transitionTimingFunction: isPlaying
                    ? 'cubic-bezier(0.4, 0, 0.2, 1)'
                    : undefined,
                }}
              >
                <span
                  className={`grid place-items-center rounded-full border-white font-black shadow-lg ${isBall ? 'h-6 w-6 border-2 bg-white text-xs' : 'h-10 w-10 border-[3px] text-sm'}`}
                  style={
                    isBall
                      ? undefined
                      : {
                          background: team ? COLOR_HEX[team.color] : '#334155',
                          color: team?.color === 'white' ? '#172019' : '#fff',
                        }
                  }
                >
                  {isBall ? '⚽' : label.slice(0, 2)}
                </span>
                {!isBall && (
                  <span className="mt-0.5 max-w-20 truncate rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-black text-white">
                    {label}
                    {positionLabel ? ` · ${positionLabel}` : ''}
                  </span>
                )}
              </button>
            );
          })}
        </section>

        <div className="order-5 grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={savePlan}
            className="h-12 rounded-xl bg-[#11823b] font-black"
          >
            <Save />
            {mode === 'position' ? 'บันทึกตำแหน่ง' : 'บันทึกแผน'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCopyLink}
            className="h-12 rounded-xl font-black"
          >
            <Share2 />
            คัดลอกลิงก์
          </Button>
        </div>
        {notice && (
          <div className="sticky bottom-20 z-30 order-6 rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white shadow-xl">
            {notice}
          </div>
        )}
      </div>
      <AlertDialog open={confirmingReset} onOpenChange={setConfirmingReset}>
        <AlertDialogContent className="rounded-[24px] p-5">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="text-lg font-black">
              {mode === 'position' ? 'จัดผู้เล่นอัตโนมัติใหม่?' : 'ล้างแผน Animation?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left font-semibold leading-6">
              {mode === 'position'
                ? 'ระบบจะใช้จำนวนคนและแผนที่เลือก วางผู้เล่นหนึ่งคนไว้บริเวณหน้าประตู และจัดคนอื่นจากทุกตำแหน่งที่เล่นได้ ส่วน Animation และข้อมูลเดิมส่วนอื่นจะยังอยู่'
                : 'ทุกจังหวะและเส้นใน Animation จะถูกล้าง ส่วนตำแหน่งบนกระดานปกติจะยังอยู่'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 grid grid-cols-2 bg-white">
            <AlertDialogCancel className="h-12 rounded-xl font-black">
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={resetCurrentMode}
              className="h-12 rounded-xl font-black"
            >
              {mode === 'position' ? 'จัดตำแหน่งใหม่' : 'รีเซ็ต'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
