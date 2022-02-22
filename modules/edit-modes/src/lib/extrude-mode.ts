import turfBearing from '@turf/bearing';
import turfCenterOfMass from '@turf/center-of-mass';

import {
  generatePointsParallelToLinePoints,
  getPickedEditHandle,
  getPickedIntermediateEditHandle,
  recursivelyTraverseNestedArrays,
} from '../utils';
import { point } from '@turf/helpers';
import { FeatureCollection } from '../geojson-types';
import { ModeProps, StartDraggingEvent, StopDraggingEvent, DraggingEvent } from '../types';
import { ImmutableFeatureCollection } from './immutable-feature-collection';
import { GeoJsonEditMode, GuideFeatureCollection, PointerMoveEvent, Position } from '..';
import { getIntermediatePosition } from './geojson-edit-mode';

export class ExtrudeMode extends GeoJsonEditMode {
  _isPointAdded = false;
  _cursor = null;

  handleDragging(event: DraggingEvent, props: ModeProps<FeatureCollection>): void {
    const editHandle = getPickedEditHandle(event.pointerDownPicks);

    if (editHandle) {
      const { featureIndex } = editHandle.properties;
      let { positionIndexes } = editHandle.properties;

      const size = this.coordinatesSize(positionIndexes, featureIndex, props.data);
      positionIndexes = this._isPointAdded
        ? this.nextPositionIndexes(positionIndexes, size)
        : positionIndexes;
      // p1 and p1 are end points for edge
      const p1 = this.getPointForPositionIndexes(
        this.prevPositionIndexes(positionIndexes, size),
        featureIndex,
        props.data
      );
      const p2 = this.getPointForPositionIndexes(positionIndexes, featureIndex, props.data);
      if (p1 && p2) {
        // p3 and p4 are end points for moving (extruding) edge
        const [p3, p4] = generatePointsParallelToLinePoints(p1, p2, event.mapCoords);

        const updatedData = new ImmutableFeatureCollection(props.data)
          .replacePosition(featureIndex, this.prevPositionIndexes(positionIndexes, size), p4)
          .replacePosition(featureIndex, positionIndexes, p3)
          .getObject();

        props.onEdit({
          updatedData,
          editType: 'extruding',
          editContext: {
            featureIndexes: [featureIndex],
            positionIndexes: this.nextPositionIndexes(positionIndexes, size),
            position: p3,
          },
        });

        event.cancelPan();
      }
    }
  }

  handlePointerMove(event: PointerMoveEvent, props: ModeProps<FeatureCollection>): void {
    this.updateCursor(event, props);
  }

  handleStartDragging(event: StartDraggingEvent, props: ModeProps<FeatureCollection>) {
    const selectedFeatureIndexes = props.selectedIndexes;

    const editHandle = getPickedIntermediateEditHandle(event.picks);
    if (selectedFeatureIndexes.length && editHandle) {
      const { positionIndexes, featureIndex } = editHandle.properties;

      const size = this.coordinatesSize(positionIndexes, featureIndex, props.data);
      // p1 and p1 are end points for edge
      const p1 = this.getPointForPositionIndexes(
        this.prevPositionIndexes(positionIndexes, size),
        featureIndex,
        props.data
      );
      const p2 = this.getPointForPositionIndexes(positionIndexes, featureIndex, props.data);

      if (p1 && p2) {
        let updatedData = new ImmutableFeatureCollection(props.data);
        if (!this.isOrthogonal(positionIndexes, featureIndex, size, props.data)) {
          updatedData = updatedData.addPosition(featureIndex, positionIndexes, p2);
        }
        if (
          !this.isOrthogonal(
            this.prevPositionIndexes(positionIndexes, size),
            featureIndex,
            size,
            props.data
          )
        ) {
          updatedData = updatedData.addPosition(featureIndex, positionIndexes, p1);
          this._isPointAdded = true;
        }

        props.onEdit({
          updatedData: updatedData.getObject(),
          editType: 'startExtruding',
          editContext: {
            featureIndexes: [featureIndex],
            positionIndexes,
            position: p1,
          },
        });
      }
    }
  }

  handleStopDragging(event: StopDraggingEvent, props: ModeProps<FeatureCollection>) {
    const selectedFeatureIndexes = props.selectedIndexes;
    const editHandle = getPickedEditHandle(event.pointerDownPicks);
    if (selectedFeatureIndexes.length && editHandle) {
      const { featureIndex } = editHandle.properties;
      let { positionIndexes } = editHandle.properties;

      const size = this.coordinatesSize(positionIndexes, featureIndex, props.data);
      positionIndexes = this._isPointAdded
        ? this.nextPositionIndexes(positionIndexes, size)
        : positionIndexes;
      // p1 and p1 are end points for edge
      const p1 = this.getPointForPositionIndexes(
        this.prevPositionIndexes(positionIndexes, size),
        featureIndex,
        props.data
      );
      const p2 = this.getPointForPositionIndexes(positionIndexes, featureIndex, props.data);

      if (p1 && p2) {
        // p3 and p4 are end points for new moved (extruded) edge
        const [p3, p4] = generatePointsParallelToLinePoints(p1, p2, event.mapCoords);

        const updatedData = new ImmutableFeatureCollection(props.data)
          .replacePosition(featureIndex, this.prevPositionIndexes(positionIndexes, size), p4)
          .replacePosition(featureIndex, positionIndexes, p3)
          .getObject();

        props.onEdit({
          updatedData,
          editType: 'extruded',
          editContext: {
            featureIndexes: [featureIndex],
            positionIndexes,
            position: p3,
          },
        });
      }
    }
    this._isPointAdded = false;
  }

  coordinatesSize(
    positionIndexes: number[] | null | undefined,
    featureIndex: number,
    { features }: FeatureCollection
  ) {
    let size = 0;
    if (Array.isArray(positionIndexes)) {
      const feature = features[featureIndex];
      const coordinates: any = feature.geometry.coordinates;
      // for Multi polygons, length will be 3
      if (positionIndexes.length === 3) {
        const [a, b] = positionIndexes;
        if (coordinates.length && coordinates[a].length) {
          size = coordinates[a][b].length;
        }
      } else {
        const [b] = positionIndexes;
        if (coordinates.length && coordinates[b].length) {
          size = coordinates[b].length;
        }
      }
    }
    return size;
  }

  getBearing(p1: any, p2: any) {
    const angle = turfBearing(p1, p2);
    if (angle < 0) {
      return Math.floor(360 + angle);
    }
    return Math.floor(angle);
  }

  getSelectedFeaturesAsFeatureCollection(props: ModeProps<FeatureCollection>): FeatureCollection {
    const { features } = props.data;
    const selectedFeatures = props.selectedIndexes.map((selectedIndex) => features[selectedIndex]);
    return {
      type: 'FeatureCollection',
      features: selectedFeatures,
    };
  }

  getGuides(props: ModeProps<FeatureCollection>): GuideFeatureCollection {
    const handles = [];

    const selectedGeometry = this.getSelectedFeaturesAsFeatureCollection(props);

    selectedGeometry.features.forEach((feature) => {
      recursivelyTraverseNestedArrays(feature.geometry.coordinates, [], (coords, prefix) => {
        let previousCoord: Position = null;
        coords.forEach((coord: Position, index: number) => {
          if (previousCoord) {
            const edgeMidpoint = getIntermediatePosition(coord, previousCoord);
            const handle = point(edgeMidpoint, {
              guideType: 'editHandle',
              editHandleType: 'intermediate',
              featureIndex: 0,
              positionIndexes: [...prefix, index],
            });
            handles.push(handle);
          }
          previousCoord = coord;
        });
      });
    });

    return {
      type: 'FeatureCollection',
      features: handles,
    };
  }

  isOrthogonal(
    positionIndexes: number[] | null | undefined,
    featureIndex: number,
    size: number,
    features: FeatureCollection
  ) {
    if (!Array.isArray(positionIndexes)) {
      return false;
    }
    if (positionIndexes[positionIndexes.length - 1] === size - 1) {
      positionIndexes[positionIndexes.length - 1] = 0;
    }
    const prevPoint = this.getPointForPositionIndexes(
      this.prevPositionIndexes(positionIndexes, size),
      featureIndex,
      features
    );
    const nextPoint = this.getPointForPositionIndexes(
      this.nextPositionIndexes(positionIndexes, size),
      featureIndex,
      features
    );
    const currentPoint = this.getPointForPositionIndexes(positionIndexes, featureIndex, features);
    const prevAngle = this.getBearing(currentPoint, prevPoint);
    const nextAngle = this.getBearing(currentPoint, nextPoint);
    return [89, 90, 91, 269, 270, 271].includes(Math.abs(prevAngle - nextAngle));
  }

  nextPositionIndexes(positionIndexes: number[] | null | undefined, size: number): number[] {
    if (!Array.isArray(positionIndexes)) {
      return [];
    }
    const next = [...positionIndexes];
    if (next.length) {
      next[next.length - 1] = next[next.length - 1] === size - 1 ? 0 : next[next.length - 1] + 1;
    }
    return next;
  }

  prevPositionIndexes(positionIndexes: number[] | null | undefined, size: number): number[] {
    if (!Array.isArray(positionIndexes)) {
      return [];
    }
    const prev = [...positionIndexes];
    if (prev.length) {
      prev[prev.length - 1] = prev[prev.length - 1] === 0 ? size - 2 : prev[prev.length - 1] - 1;
    }
    return prev;
  }

  getPointForPositionIndexes(
    positionIndexes: number[] | null | undefined,
    featureIndex: number,
    { features }: FeatureCollection
  ) {
    let p1;
    if (Array.isArray(positionIndexes)) {
      const feature = features[featureIndex];
      const coordinates: any = feature.geometry.coordinates;
      // for Multi polygons, length will be 3
      if (positionIndexes.length === 3) {
        const [a, b, c] = positionIndexes;
        if (coordinates.length && coordinates[a].length) {
          p1 = coordinates[a][b][c];
        }
      } else {
        const [b, c] = positionIndexes;
        if (coordinates.length && coordinates[b].length) {
          p1 = coordinates[b][c];
        }
      }
    }
    return p1;
  }

  updateCursor(event: PointerMoveEvent, props: ModeProps<FeatureCollection>): void {
    const picks = (event && event.picks) || [];
    const handlesPicked = getPickedEditHandle(picks);
    if (handlesPicked) {
      const selectedEditHandle =
        handlesPicked.properties.editHandleType === 'intermediate' ? handlesPicked : null;
      const selectedGeometry = this.getSelectedFeaturesAsFeatureCollection(props);
      const center = turfCenterOfMass(selectedGeometry);
      const bearing = turfBearing(center, selectedEditHandle);
      const cursorState = this.getCursorState(bearing, props);
      this._cursor = cursorState;
    } else {
      this._cursor = null;
    }

    props.onUpdateCursor(this._cursor);
  }
}
