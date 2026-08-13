"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { CalendarApi, EventInput } from "@fullcalendar/core/index.js";
import { Popover } from "@heroui/react";

export interface CalendarComponentRef {
  calendarApi: CalendarApi | undefined;
}

interface CalendarComponentProps {
  calendarView: string;
  calendarEvents: EventInput[];
  renderStatus?: (state: string) => ReactNode;
  onUpdateCalendarTitle?: (title: string) => void;
  onItemClick?: (info: { activityId: string }) => void;
}

const CalendarComponent = forwardRef<CalendarComponentRef, CalendarComponentProps>(
  ({ calendarView, calendarEvents, renderStatus, onUpdateCalendarTitle, onItemClick }, ref) => {
    const fullCalendarRef = useRef<FullCalendar>(null);

    useImperativeHandle(ref, () => ({
      get calendarApi() {
        return fullCalendarRef.current?.getApi();
      },
    }));

    return (
      <FullCalendar
        ref={fullCalendarRef}
        plugins={[dayGridPlugin, timeGridPlugin]}
        headerToolbar={false}
        initialView={calendarView}
        handleWindowResize
        events={calendarEvents}
        dayMaxEventRows={4}
        eventMaxStack={2}
        slotEventOverlap={false}
        expandRows
        contentHeight={1500}
        eventDisplay="block"
        datesSet={(arg) => {
          setTimeout(() => {
            if (!calendarEvents.length) return;
            onUpdateCalendarTitle?.(arg.view.title);
          });
        }}
        eventContent={(arg) => {
          const props = arg.event.extendedProps as {
            activity_id: string;
            activity_name: string;
            start_time: string;
            end_time: string;
            state: string;
            number: string | number;
            quota: string | number;
          };
          return (
            <Popover>
              <Popover.Trigger>
                <div
                  className={`w-full min-h-[1.5em] leading-[1.5em] overflow-hidden text-ellipsis whitespace-nowrap ${
                    props.state !== "1" ? "cursor-not-allowed" : "cursor-pointer"
                  }`}
                  onClick={() => onItemClick?.({ activityId: props.activity_id })}
                >
                  {props.activity_name}
                </div>
              </Popover.Trigger>
              <Popover.Content placement="bottom start" className="z-[99999]">
                <Popover.Arrow />
                <Popover.Dialog aria-label="event detail">
                  <div>
                    {props.start_time + " — " + props.end_time}
                    {renderStatus?.(props.state)}
                  </div>
                  <div>
                    Occupied:{props.number}/{props.quota}
                  </div>
                  <b>{props.activity_name}</b>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          );
        }}
      />
    );
  }
);

CalendarComponent.displayName = "CalendarComponent";

export default CalendarComponent;
