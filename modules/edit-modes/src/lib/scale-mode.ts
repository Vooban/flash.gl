/* eslint-disable prettier/prettier */
import turfCenterOfMass from '@turf/center-of-mass';
import turfBearing from '@turf/bearing';
import { point, featureCollection, Feature, Point } from '@turf/helpers';
import polygonToLine from '@turf/polygon-to-line';
import { coordEach } from '@turf/meta';
import turfDistance from '@turf/distance';
import turfTransformScale from '@turf/transform-scale';
import { getCoord, getGeom } from '@turf/invariant';
import { FeatureCollection, Position } from '../geojson-types';
import {
  ModeProps,
  PointerMoveEvent,
  StartDraggingEvent,
  StopDraggingEvent,
  DraggingEvent,
  EditHandleFeature,
  GuideFeatureCollection,
} from '../types';
import { getPickedEditHandle } from '../utils';
import { GeoJsonEditMode, getIntermediatePosition } from './geojson-edit-mode';
import { ImmutableFeatureCollection } from './immutable-feature-collection';

export class ScaleMode extends GeoJsonEditMode {
  _geometryBeingScaled: FeatureCollection | null | undefined;
  _selectedEditHandle: EditHandleFeature | null | undefined;
  _guidePoints: Array<EditHandleFeature>;
  _cursor: string | null | undefined;
  _isScaling = false;
  _bearing = 0;

  _isSinglePointGeometrySelected = (geometry: FeatureCollection | null | undefined): boolean => {
    const { features } = geometry || {};
    if (Array.isArray(features) && features.length === 1) {
      // @ts-ignore
      const { type } = getGeom(features[0]);
      return type === 'Point';
    }
    return false;
  };

  _isSingleGeometrySelected = (geometry: FeatureCollection | null | undefined): boolean => {
    const { features } = geometry || {};
    return Array.isArray(features) && features.length === 1;
  };

  _getOppositeScaleHandle = (selectedHandle: EditHandleFeature) => {
    const selectedHandleIndex =
      Array.isArray(selectedHandle?.properties?.positionIndexes) &&
      selectedHandle.properties.positionIndexes[0];

    if (typeof selectedHandleIndex !== 'number') {
      return null;
    }
    const points = this._guidePoints.filter(
      (pt) => selectedHandle.properties.shape === pt.properties.shape
    );
    const guidePointCount = points.length;
    const oppositeIndex = (selectedHandleIndex + guidePointCount / 2) % guidePointCount;
    return points.find((p) => {
      if (!Array.isArray(p.properties.positionIndexes)) {
        return false;
      }
      return p.properties.positionIndexes[0] === oppositeIndex;
    });
  };

  _getUpdatedData = (props: ModeProps<FeatureCollection>, editedData: FeatureCollection) => {
    let updatedData = new ImmutableFeatureCollection(props.data);
    const selectedIndexes = props.selectedIndexes;
    for (let i = 0; i < selectedIndexes.length; i++) {
      const selectedIndex = selectedIndexes[i];
      const movedFeature = editedData.features[i];
      updatedData = updatedData.replaceGeometry(selectedIndex, movedFeature.geometry);
    }
    return updatedData.getObject();
  };

  isEditHandleSelected = (): boolean => Boolean(this._selectedEditHandle);

  getScaleAction = (
    startDragPoint: Position,
    currentPoint: Position,
    editType: string,
    props: ModeProps<FeatureCollection>
  ) => {
    if (!this._selectedEditHandle) {
      return null;
    }

    const oppositeHandle = this._getOppositeScaleHandle(this._selectedEditHandle);
    const origin = getCoord(oppositeHandle);
    // @ts-ignore
    const scaleFactor = getScaleFactor(origin, startDragPoint, currentPoint);
    // @ts-ignore
    const scaledFeatures: FeatureCollection = turfTransformScale(
      // @ts-ignore
      this._geometryBeingScaled,
      scaleFactor,
      { origin }
    );

    return {
      updatedData: this._getUpdatedData(props, scaledFeatures),
      editType,
      editContext: {
        featureIndexes: props.selectedIndexes,
      },
    };
  };

  updateCursor = (props: ModeProps<FeatureCollection>) => {
    if (this._selectedEditHandle) {
      if (this._cursor) {
        props.onUpdateCursor(this._cursor);
      }
      const cursorGeometry = this.getSelectedFeaturesAsBoxBindedToViewBearing(props);

      const center = turfCenterOfMass(cursorGeometry);
      const bearing = turfBearing(center, this._selectedEditHandle);
      const cursorState = this.getCursorState(bearing, props);
      this._cursor = cursorState;
    } else {
      this._cursor = null;
    }
    props.onUpdateCursor(this._cursor);
  };

  handlePointerMove(event: PointerMoveEvent, props: ModeProps<FeatureCollection>) {
    if (!this._isScaling) {
      const selectedEditHandle = getPickedEditHandle(event.picks);
      this._selectedEditHandle =
        selectedEditHandle && selectedEditHandle.properties.editHandleType === 'scale'
          ? selectedEditHandle
          : null;

      this.updateCursor(props);
    }
  }

  handleStartDragging(event: StartDraggingEvent, props: ModeProps<FeatureCollection>) {
    if (this._selectedEditHandle) {
      this._isScaling = true;
      this._geometryBeingScaled = this.getSelectedFeaturesAsFeatureCollection(props);
    }
  }

  handleDragging(event: DraggingEvent, props: ModeProps<FeatureCollection>) {
    if (!this._isScaling) {
      return;
    }

    console.log(event);

    props.onUpdateCursor(this._cursor);

    const scaleAction = this.getScaleAction(
      event.pointerDownMapCoords,
      event.mapCoords,
      'scaling',
      props
    );
    if (scaleAction) {
      props.onEdit(scaleAction);
    }

    event.cancelPan();
  }

  handleStopDragging(event: StopDraggingEvent, props: ModeProps<FeatureCollection>) {
    if (this._isScaling) {
      // Scale the geometry
      const scaleAction = this.getScaleAction(
        event.pointerDownMapCoords,
        event.mapCoords,
        'scaled',
        props
      );
      if (scaleAction) {
        props.onEdit(scaleAction);
      }

      props.onUpdateCursor(null);

      this._geometryBeingScaled = null;
      this._selectedEditHandle = null;
      this._cursor = null;
      this._isScaling = false;
    }
  }

  getGuides(props: ModeProps<FeatureCollection>): GuideFeatureCollection {
    this._guidePoints = [];
    const selectedGeometry = this.getSelectedFeaturesAsFeatureCollection(props);

    this._bearing =
      (selectedGeometry.features.length && props.modeConfig.bearing && props.viewState?.bearing) ||
      0;

    // Add buffer to the enveloping box if a single Point feature is selected
    if (this._isSinglePointGeometrySelected(selectedGeometry)) {
      return { type: 'FeatureCollection', features: [] };
    }

    const boundingBox = this.getSelectedFeaturesAsBoxBindedToViewBearing(props);

    // if (this._isSingleGeometrySelected(selectedGeometry)) {
    //   boundingBox = selectedGeometry.features[0] as Feature<Polygon>;
    // } else
    // if (this._bearing) {
    //   const geometry = {
    //     ...selectedGeometry,
    //     features: selectedGeometry.features.map((f) => {
    //       const pivot = turfCenterOfMass(f.geometry);
    //       return { ...f, geometry: turfTransformRotate(f.geometry, -this._bearing, { pivot }) };
    //     }),
    //   };
    //   const box = bboxPolygon(bbox(geometry));
    //   const centroid = turfCenterOfMass(geometry);
    //   boundingBox = turfTransformRotate(box, this._bearing, { pivot: centroid });
    // }

    boundingBox.properties.mode = 'scale';
    const guidePoints = [];

    let previousCoord = null;
    coordEach(boundingBox, (coord, coordIndex) => {
      if (
        !guidePoints.some((pt: Feature<Point>) =>
          samePosition(pt.geometry.coordinates as Position, coord as Position)
        )
      ) {
        // Get corner midpoint guides from the enveloping box
        const cornerPoint = point(coord, {
          guideType: 'editHandle',
          editHandleType: 'scale',
          positionIndexes: [coordIndex],
          shape: 'corner',
        });
        guidePoints.push(cornerPoint);
      }
      if (previousCoord) {
        const axeMidCoord = getIntermediatePosition(coord as Position, previousCoord as Position);
        const axeMidPoint = point(axeMidCoord, {
          guideType: 'editHandle',
          editHandleType: 'scale',
          positionIndexes: [coordIndex - 1],
          shape: 'axe',
        });
        if (false) guidePoints.push(axeMidPoint);
      }
      previousCoord = coord;
    });

    this._guidePoints = guidePoints;
    // @ts-ignore
    return featureCollection([polygonToLine(boundingBox), ...this._guidePoints]);
  }
}

function samePosition(coord1: Position, coord2: Position) {
  return coord1[0] === coord2[0] && coord1[1] === coord2[1];
}

function getScaleFactor(centroid: Position, startDragPoint: Position, currentPoint: Position) {
  const startDistance = turfDistance(centroid, startDragPoint);
  const endDistance = turfDistance(centroid, currentPoint);
  return endDistance / startDistance;
}
